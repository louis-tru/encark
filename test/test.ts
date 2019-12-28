
export interface A {
}

export class B implements A {
}

export class C {
}

export default function test(a: B | C ) {
	var ok = a as A;
	console.log(ok)

	let f: any = 6;   //变量a被类型推断为number
	console.log(f as string);  // 输出6 ：number类型
	console.log((f as string).length); //输出undifined
}
