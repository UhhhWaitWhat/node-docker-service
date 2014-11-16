var _ = require('lodash');
var trequire = require('trequire');
var fs = trequire('fs');
var path = require('path');
var spawn = require('child_process').spawn;

var docker = function(opts, verbose) {
	return function(cb) {
		var docker = spawn('docker', opts.join(' ').split(' '));
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

Service.prototype.resume = function *() {
	yield docker(['start', this.name]);
};

Service.prototype.build = function *() {
	if(this.dockerfile) {
		yield docker(['build -t', this.tag, this.directory], true);
	} else {
		yield docker(['pull', this.tag], true);
	}
};

Service.prototype.getConfigs = function *() {
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

Service.prototype.remove = function *() {
	if(yield this.isRunning()) {
		yield docker(['stop', this.name]);
	}

	if(yield this.isBuilt()) {
		yield docker(['rm', this.name]);
	}

	yield docker(['rmi', this.tag]);
};

Service.prototype.start = function *() {
	yield this.validate();
	if(yield this.isRunning()) return;

	yield this.startDeps();

	if(yield this.isBuilt()) {
		yield this.resume();
	} else if(yield this.hasImage()) {
		yield this.run();
	} else {
		yield this.build();
		yield this.run();
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

Service.prototype.run = function *() {
	var args = ['run -d --name', this.name];

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

	yield docker(args.concat(mounts).concat(configs).concat(deps).concat(ports).concat([this.tag]));
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
