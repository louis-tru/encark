
// export * from __requireNgui__('_http');

import event, {EventNoticer} from './event'

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