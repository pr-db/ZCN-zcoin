const sha256 = require('sha256');
const currentNodeUrl = process.argv[3];
function Zlockchain() {
    this.chain = [];
    this.pendingTransactions = [];

    this.currentNodeUrl = currentNodeUrl;;
    this.networkNodes = [];

    this.createNewBlock(0, '0', '0');
};
Zlockchain.prototype.createNewBlock = function (nonce, prevBlockHash, hash) {
    const newBlock = {
        index: this.chain.length + 1,
        timestamp: Date.now(),
        transactions: this.pendingTransactions,
        nonce: nonce,
        hash: hash,
        prevBlockHash: prevBlockHash,
    };
    this.pendingTransactions = [];
    this.chain.push(newBlock);

    return newBlock;
};
Zlockchain.prototype.getLastBlock = function () {
    return this.chain[this.chain.length - 1];
};
Zlockchain.prototype.createNewTransaction = function (amount, sender, recipient) {
    const newTransaction = {
        amount: amount,
        sender: sender,
        recipient: recipient,
    };
    this.pendingTransactions.push(newTransaction);
    return this.getLastBlock()['index'] + 1;
};
Zlockchain.prototype.hashBlock = function (prevBlockHash, currentBlockData, nonce) {
    const blockdata = prevBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
    const hash = sha256(blockdata);
    return hash;
};
Zlockchain.prototype.proofOfWork = function (prevBlockHash, currentBlockData) {
    let nonce = 0;
    let hash = this.hashBlock(prevBlockHash, currentBlockData, nonce);
    while (hash.substring(0, 4) != '0000') {
        nonce++;
        hash = this.hashBlock(prevBlockHash, currentBlockData, nonce);
    }
    return nonce;
}
module.exports = Zlockchain;