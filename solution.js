// solution.js
const readline = require('readline');

const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

const inputLines = [];
let curLine = 0;

reader.on('line', (line) => {
    inputLines.push(line);
});

reader.on('close', () => {
    solve();
});

function readNumber() {
    return Number(inputLines[curLine++]);
}

function getSum(a, b) {
    return a + b;
}

function solve() {
    const a = readNumber();
    const b = readNumber();
    const result = getSum(a, b);
    console.log(result);
}
