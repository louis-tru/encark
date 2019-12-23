
import wget from './wget';

wget(
	'http://upgrade-os.hard-chain.cn/201911291926/dphotos-develop-2.313.119.tar.gz', 
	'./out/2018-10-19_leveldb_full.zip',
	{
		renewal: true,
		limit: 200 * 1024,
		onProgress: e=>{
			console.log(e, Math.floor(e.speed / 1024));
		},
	}
).then(console.error);
