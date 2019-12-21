
import {SimpleBuffer} from './buffer';

var b = SimpleBuffer.from('你好a');

console.log(b);
console.log(b.toString('utf8'));
console.log(b.toString('hex'));
console.log(b.toString('base64'));
console.log(b.toString('binary'));
console.log(b.toString('ascii'));

console.log('---------------');

console.log(SimpleBuffer.from(b.toString('hex'), 'hex'));
console.log(SimpleBuffer.from(b.toString('base64'), 'base64'));
console.log(SimpleBuffer.from(b.toString('binary'), 'binary'));
console.log(SimpleBuffer.from(b.toString('ascii'), 'ascii'));


console.log(SimpleBuffer.from([1,2,3,4,5]))

console.log(SimpleBuffer.concat([new SimpleBuffer(2), new SimpleBuffer(10)]));