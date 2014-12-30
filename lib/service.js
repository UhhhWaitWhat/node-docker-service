var _ = require('lodash');
var trequire = require('trequire');
var fs = trequire('fs');
var path = require('path');
var spawn = require('child_process').spawn;

var docker = function(opts, verbose) {
	return function(cb) {
		var docker = spawn('docker', opts.join(' ').split(' ').filter(function(el) {return el.length > 0;}));
		var buffered = [];
		var errbuffered = [];

		docker.stdout.on('data', function(data) {
			buffered.push(data);
		});

		docker.stderr.on('data', function(data) {
			errbuffered.push(data);
		});

		docker.on('exit', function(code) {
			if(code !== 0) cb(new Error(errbuffered.join('\n')));
			cb(null, buffered.join(''));
		});

		if(verbose) docker.stdout.pipe(process.stdout);
	};
};

function Service(directory, services) {
	var json = JSON.parse(fs.readFileSync(path.join(directory, 'service.json')));

	this.services = services;
	this.directory = directory;

	this.tag = json.tag;
	this.name = json.name || json.tag.split('/').pop();
	this.deps = json.deps || [];
	this.ports = json.ports || [];
	this.mounts = json.mounts || {};
	this.configs = json.configs || {};

	this.dockerfile = fs.existsSync(path.join(directory, 'Dockerfile'));
	this.config = fs.existsSync(path.join(directory, 'config'));
}

Service.prototype.validate = function *() {
	if(typeof this.tag !== 'string') throw new TypeError('Invalid Tagname');
	if(typeof this.name !== 'string') throw new TypeError('Invalid Name');
	if(typeof this.deps !== 'object') throw new TypeError('Invalid Dependencies');
	if(typeof this.ports !== 'object') throw new TypeError('Invalid Ports');
	if(typeof this.mounts !== 'object') throw new TypeError('Invalid Mounts');

	var mounts = yield this.missingMounts();
	if(mounts.length > 0) throw new Error('Missing mounts', mounts);

	var deps = yield this.missingDeps();
	if(deps.length > 0) throw new Error('Missing dependencies', deps);
};

Service.prototype.missingMounts = function *() {
	return _(this.mounts).filter(function(loc, name) {
		return !fs.existsSync(path.join(this.directory, 'mounts', name));
	}, this).value();
};

Service.prototype.missingDeps = function *() {
	return _(this.deps).filter(function(dep) {
		return !this.services[dep];
	}, this).value();
};

Service.prototype.isRunning = function *() {
	var containers = yield docker(['ps']);
	containers = containers.toString().split('\n');

	for(var x = 1; x < containers.length; x++) {
		if(containers[x].indexOf(' ' + this.name) !== -1) return true;
	}

	return false;
};

Service.prototype.isBuilt = function *() {
	var containers = yield docker(['ps -a']);
	containers = containers.toString().split('\n');

	for(var x = 1; x < containers.length; x++) {
		if(containers[x].indexOf(' ' + this.name) !== -1) return true;
	}

	return false;
};

Service.prototype.hasImage = function *() {
	var images = yield docker(['images']);
	images = images.toString().split('\n');

	for(var x = 1; x < images.length; x++) {
		if(images[x].indexOf(this.tag) !== -1) return true;
	}

	return false;
};

Service.prototype.startDeps = function *() {
	for(var dep in this.deps) {
		yield this.services[this.deps[dep]].start();
	}
};

Service.prototype.resume = function *(nodaemon) {
	yield docker(['start', nodaemon ? '-a' : '', this.name]);
};

Service.prototype.build = function *() {
	if(this.dockerfile) {
		yield docker(['build -t', this.tag, this.directory], true);
	} else {
		yield docker(['pull', this.tag], true);
	}
};

Service.prototype.getConfigs = function *() {
	var folders = this.getConfigFolders();
	var files = yield this.getConfigFiles();

	return folders.concat(files.filter(function(file) {
		return folders.filter(function(folder) {
			return path.relative(file, folder).split(path.sep).filter(function(part) {
				return part.replace(/\./g, '').length > 0;
			}).length === 0;
		}).length === 0;
	}));
};

Service.prototype.getConfigFiles = function *() {
	function *any(pth) {
		var stats = yield fs.costat(pth);

		if(stats.isDirectory()) {
			return yield dir(pth);
		} else if(stats.isFile()) {
			return [pth];
		} else {
			return [];
		}
	}

	function *dir(pth) {
		var files = yield fs.coreaddir(pth);

		return yield files.map(function(file) {
			return any(path.join(pth, file));
		});
	}

	return _(yield any(path.join(this.directory, 'config'))).flatten().map(function(config) {
		return path.relative(path.join(this.directory, 'config'), config);
	}, this).value();
};

Service.prototype.getConfigFolders = function() {
	function step(obj, prefix) {
		return _.map(obj, function(el, pth) {
			if(Object.keys(el).length === 0) {
				return path.join(prefix, pth);
			} else {
				return step(el, path.join(prefix, pth));
			}
		});
	}

	var folders = _.flatten(step(this.configs, ''));
	for(var x = 0; x < folders.length; x++) {
		if(fs.existsSync(folders[x])) {
			var err = new Error('ENOENT, config folder does not exist "' + folders[x] + '"');
			err.code = 'ENOENT';

			throw err;
		}
	}

	return folders;
};

Service.prototype.remove = function *() {
	if(yield this.isRunning()) {
		yield docker(['stop', this.name]);
	}

	if(yield this.isBuilt()) {
		yield docker(['rm', this.name]);
	}

	yield docker(['rmi', this.tag]);
};

Service.prototype.start = function *(nodaemon) {
	yield this.validate();
	if(yield this.isRunning()) return;

	yield this.startDeps();

	if(yield this.isBuilt()) {
		yield this.resume(nodaemon);
	} else if(yield this.hasImage()) {
		yield this.run(nodaemon);
	} else {
		yield this.build();
		yield this.run(nodaemon);
	}
};

Service.prototype.stop = function *() {
	if(!(yield this.isRunning())) return;

	yield docker(['stop', this.name]);
};

Service.prototype.restart = function *() {
	yield this.stop();
	yield this.start();
};

Service.prototype.rebuild = function *() {
	yield this.remove();
	yield this.start();
};

Service.prototype.run = function *(nodaemon) {
	var args = ['run', nodaemon ? '' : '-d', '--name', this.name];

	var mounts = _(this.mounts).map(function(loc, name) {
		return '-v ' + path.join(this.directory, 'mounts', name) + ':' + loc;
	}, this).value();

	var deps = _(this.deps).map(function(dep) {
		return '--link ' + dep + ':' + dep;
	}).value();

	var configs = [];
	if(this.config) {
		configs = _(yield this.getConfigs()).map(function(config) {
			return '-v ' + path.join(this.directory, 'config', config) + ':/' + config;
		}, this).value();
	}

	var ports = _(this.ports).map(function(port) {
		return '-p ' + port + ':' + port;
	}).value();

	var timezone = ['-v /etc/localtime:/etc/localtime:ro -v /etc/timezone:/etc/timezone:ro'];

	yield docker(args.concat(mounts).concat(timezone).concat(configs).concat(deps).concat(ports).concat([this.tag]));
};

Service.prototype.toString = function *() {
	return JSON.stringify({
		directory: this.directory,
		tag: this.tag,
		name: this.name,
		mounts: this.mounts,
		deps: this.deps,
		ports: this.ports,
		missingMounts: yield this.missingMounts(),
		missingDeps: yield this.missingDeps(),
		hasConfig: this.config,
		hasDockerfile: this.dockerfile,
		isBuilt: yield this.isBuilt(),
		hasImage: yield this.hasImage(),
		isRunning: yield this.isRunning(),
		config: this.config ? yield this.getConfigs() : []
	}, 0, 2);
};

module.exports = Service;
