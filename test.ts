
// export * from __require__('_http');

import event, {EventNoticer,Event} from './event'

function Hacker<Data = any, Sender extends object = object>(): EventNoticer<Event<Data, Sender>> {
	return null as any;
}

export default class A {
	@event onAA: EventNoticer<Event<number>> = new EventNoticer<Event<number>>('AA', {});
}

var a = new A();

a.onAA.on(function(e) {
	var a = e.data
	console.log(a);
});

a!.onAA.on(function() {});