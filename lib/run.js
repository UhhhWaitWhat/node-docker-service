var spawn = require('child_process').spawn;

function run(name) {
	return function(opts, silent) {
		return function(cb) {
			if(!silent) console.log('\n' + name, opts.join(' '));
			var app = spawn(name, opts);
			var buffered = [];
			var errbuffered = [];
			var exit = function() {
				app.kill('SIGINT');
			};

			process.on('SIGINT', exit);

			app.stdout.on('data', function(data) {
				buffered.push(data);
			});

			app.stderr.on('data', function(data) {
				errbuffered.push(data);
			});

			app.on('close', function(code, data) {
				process.removeListener('exit', exit);

				if(code !== 0) cb(new Error('\nstdout:\n' + (buffered[buffered.length-1] || '') + '\nstderr:\n' + errbuffered.join('\n')));
				if(!silent) console.log('');
				cb(null, buffered.join('\n'));
			});

			if(!silent) {
				app.stdout.pipe(process.stdout);
				app.stderr.pipe(process.stderr);
			}
		};
	};
}

module.exports = run;