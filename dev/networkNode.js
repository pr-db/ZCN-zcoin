const port = process.argv[2];

var express = require('express')
var app = express()

const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const Zlockchain = require('./zlockchain');
const praycoin = new Zlockchain();

const uuid = require('uuid/v1');
const nodeAddress = uuid().split('-').join('');

const rp = require('request-promise');
app.get('/', function (req, res) {
    res.send('Zlockchain bebe')
});

app.get('/zlockchain', function (req, res) {
    res.send(praycoin);
});

app.post('/transaction', function (req, res) {
    const newTransaction = req.body;
    const blockIndex = praycoin.addTransactionToPendingTransactions(newTransaction);
    res.json({
        note: `transaction will be added in block ${blockIndex}`
    });
});
app.post('/transaction/broadcast', function (req, res) {
    const newTransaction = praycoin.createNewTransaction(req.body.amount,
        req.body.sender, req.body.recipient);
    praycoin.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];
    praycoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });
    Promise.all(requestPromises)
        .then(data => {
            res.json({
                note: 'transaction created and broadcast successfully'
            })
        });
});

app.get('/mine', function (req, res) {
    const lastBlock = praycoin.getLastBlock();
    const prevBlockHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: praycoin.pendingTransactions,
        index: lastBlock['index'] + 1
    }
    const nonce = praycoin.proofOfWork(prevBlockHash, currentBlockData);
    const blockHash = praycoin.hashBlock(prevBlockHash, currentBlockData, nonce);
    const newBlock = praycoin.createNewBlock(nonce, prevBlockHash, blockHash);

    const requestPromises = [];
    praycoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body: { newBlock: newBlock },
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });
    Promise.all(requestPromises)
        .then(data => {
            const requestOptions = {
                uri: praycoin.currentNodeUrl + '/transaction/broadcast',
                method: 'POST',
                body: {
                    amount: 100,
                    sender: "00",
                    recipient: nodeAddress,
                },
                json: true
            };
            return rp(requestOptions);
        })
        .then(data => {
            res.json({
                note: 'New Block mined and broadcast successfully',
                block: newBlock
            });
        });
});

app.post('/receive-new-block', function (req, res) {
    const newBlock = req.body.newBlock;
    const lastBlock = praycoin.getLastBlock();

    const correctHash = lastBlock.hash === newBlock.prevBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

    if (correctHash && correctIndex) {
        praycoin.chain.push(newBlock);
        praycoin.pendingTransactions = [];

        res.json({
            note: 'New block accepted and received ',
            newBlock: newBlock
        });
    }
    else {
        res.json({
            note: 'New block rejected',
            newBlock: newBlock
        });
    }
});

app.post('/register-and-broadcast-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;

    if (praycoin.networkNodes.indexOf(newNodeUrl) == -1)
        praycoin.networkNodes.push(newNodeUrl);

    const regNodesPromises = [];
    praycoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/register-node',
            method: 'POST',
            body: { newNodeUrl: newNodeUrl },
            json: true,
        }
        regNodesPromises.push(rp(requestOptions));
    });
    Promise.all(regNodesPromises)
        .then(data => {
            const bulkRegisterOptions = {
                uri: newNodeUrl + '/register-nodes-bulk',
                method: 'POST',
                body: {
                    allNetworkNodes: [...praycoin.networkNodes,
                    praycoin.currentNodeUrl]
                },
                json: true
            };
            return rp(bulkRegisterOptions);
        })
        .then(data => {
            res.json({ note: 'New Node registered with network successfully' });
        });
});

app.post('/register-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;

    const nodeNotAlreadyPresesnt = praycoin.networkNodes.indexOf(newNodeUrl) == -1;
    const notCurrentNode = praycoin.currentNodeUrl !== newNodeUrl;

    if (nodeNotAlreadyPresesnt && notCurrentNode)
        praycoin.networkNodes.push(newNodeUrl);

    res.json({ note: 'New Node registered successfully' });
});

app.post('/register-nodes-bulk', function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
        const nodeNotAlreadyPresesnt = praycoin.networkNodes.indexOf(networkNodeUrl) == -1;
        const notCurrentNode = praycoin.currentNodeUrl !== networkNodeUrl;
        if (nodeNotAlreadyPresesnt && notCurrentNode)
            praycoin.networkNodes.push(networkNodeUrl);
    });
    res.json({ note: 'Bulk registration successful' });
});

app.get('/consensus', function (req, res) {
    const requestPromises = [];
    praycoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/zlockchain',
            method: 'GET',
            json: true
        }
        requestPromises.push(rp(requestOptions));
    });
    Promise.all(requestPromises)
        .then(zlockchains => {
            const currentChainLength = praycoin.chain.length;
            let maxChainLength = currentChainLength;
            let newLongestChain = null;
            let newPendingTransactions = null;

            zlockchains.forEach(zlockchain => {
                if (zlockchain.chain.length > maxChainLength) {
                    maxChainLength = zlockchain.chain.length;
                    newLongestChain = zlockchain.chain;
                    newPendingTransactions = zlockchain.pendingTransactions;
                }
            });
            if (!newLongestChain || (newLongestChain && !praycoin.chainIsValid(newLongestChain))) {
                res.json({
                    note: 'Current chain has not been replaced',
                    chain: praycoin.chain
                })
            }
            else {
                praycoin.chain = newLongestChain;
                praycoin.pendingTransactions = newPendingTransactions;
                res.json({
                    note: 'This chain has been replaced',
                    chain: praycoin.chain
                });
            }
        });
});

app.get('/block/:blockHash', function (req, res) {
    const blockHash = req.params.blockHash;
    const correctBlock = praycoin.getBlock(blockHash);
    res.json({
        block: correctBlock
    });
});

app.get('/transaction/:transactionId', function (req, res) {
    const transactionId = req.params.transactionId;
    const transactionData = praycoin.getTransaction(transactionId);
    res.json({
        transaction: transactionData.transaction,
        block: transactionData.block
    });
});

app.get('/address/:address', function (req, res) {
    const address = req.params.address;
    const addressData = praycoin.getAddressData(address);
    res.json({
        addressData: addressData
    })
});

app.get('/block-explorer', function (req, res) {
    res.sendFile('./block-explorer/index.html', {
        root: __dirname
    });
})
app.listen(port, function () {
    console.log(`listening on port ${port}...`);
});