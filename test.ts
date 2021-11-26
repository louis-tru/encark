
// export * from __require__('_http');

import event, {EventNoticer,Event} from './event'

function Hacker<Sender extends object = object, Data = any>(): EventNoticer<Event<Sender, Data>> {
	return null as any;
}

export default class A {
	@event onAA: EventNoticer<Event<any, number>> = new EventNoticer<Event<any, number>>('AA', {});
}

var a = new A();

a.onAA.on(function(e) {
	var a = e.data
	console.log(a);
});

a!.onAA.on(function() {});