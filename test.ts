
// export * from __requireNgui__('_http');

import event, {EventNoticer,Event} from './event'

function Hacker<Data = any, Sender = any>(): EventNoticer<Event<Data, Sender>> {
	return null as any;
}

export default class A {
	@event onAA: EventNoticer<Event<number>>;
}

var a = new A();

a.onAA.on(function(e) {
	var a = e.data
	console.log(a);
});