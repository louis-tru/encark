
interface Object {
	hashCode(obj: any): number;
}

namespace _ext {

Object.prototype.hashCode = function(): number {
	return 100;
}

}