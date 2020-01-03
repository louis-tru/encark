
import buffer from './buffer';

var b = buffer.from('你好a');

console.log(b);
console.log(b.toString('utf8'));
console.log(b.toString('hex'));
console.log(b.toString('base64'));
console.log(b.toString('binary'));
console.log(b.toString('ascii'));

console.log('---------------');

console.log(buffer.from(b.toString('hex'), 'hex'));
console.log(buffer.from(b.toString('base64'), 'base64'));
console.log(buffer.from(b.toString('binary'), 'binary'));
console.log(buffer.from(b.toString('ascii'), 'ascii'));


console.log(buffer.from([1,2,3,4,5]))

console.log(buffer.concat([buffer.alloc(2), buffer.alloc(10)]));