

import {EventNoticer} from './_event'

function event(target: any, propertyName: string) {
	// console.log("I am decorator.", target)
	// target[propertyName] = new EventNoticer('AA', {});
	// console.log(propertyName)
	// return new EventNoticer('AA', {});

	Object.defineProperty(target, propertyName, {
		configurable: false,
    // enumerable: false,
    // value?: any;
    // writable?: boolean;
    get() {

		},
    set() {

		},
	})
}

function Hacker<Data = any, Return = number, Sender = any>(): EventNoticer<Data, Return, Sender> {
	return null as any;
}

export default class A {
	@event onAA: EventNoticer<number>;
}

var a = new A();

a.onAA.on(function(e) {
	var a = e.data
	console.log(a);
});