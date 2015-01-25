"use strict";
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var docker = require('./run')('docker');
var systemctl = require('./run')('systemctl');

function Service(directory) {
	var json = JSON.parse(fs.readFileSync(path.join(directory, 'service.json')));

	this.directory = directory;

	this.tag = json.tag;
	this.name = json.name || json.tag.split('/').pop();
	this.deps = json.deps || [];
	this.dept = json.dept || [];
	this.optDeps = json.optDeps || [];
	this.optDept = json.optDept || [];
	this.ports = json.ports || [];
	this.mounts = json.mounts || {};
	this.configs = json.configs || {};
	this.servicename = 'docker-' + this.name + '.service';
}

Service.prototype.getConfigs = function *() {
	var folders = yield this.getConfigFolders();
	var files = yield this.getConfigFiles();

	//Combine files and folders
	return folders.concat(files.filter(function(file) {
		//Filter out files, which have no parent folders
		return folders.filter(function(folder) {
			return path.relative(folder, file).indexOf('..' + path.sep) !== 0;
		}).length === 0;
	}));
};

Service.prototype.getConfigFiles = function *() {
	if(fs.existsSync(path.join(this.directory, 'config'))) return [];

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

	//Recursively read all files in our directory
	return _(yield any(path.join(this.directory, 'config'))).flatten().map(function(config) {
		return '/' + path.relative(path.join(this.directory, 'config'), config);
	}, this).value();
};

Service.prototype.getConfigFolders = function *() {
	function step(obj, prefix) {
		return _.map(obj, function(el, pth) {
			if(Object.keys(el).length === 0) {
				return path.join(prefix, pth);
			} else {
				return step(el, path.join(prefix, pth));
			}
		});
	}

	//Combine the object structure into flat folders and check for their existence
	var folders = _.flatten(step(this.configs, ''));
	for(var x = 0; x < folders.length; x++) {
		if(!fs.existsSync(path.join(this.directory, 'config', folders[x]))) {
			var err = new Error('ENOENT, config folder does not exist "' + folders[x] + '"');
			err.code = 'ENOENT';

			throw err;
		}
	}

	return folders;
};

Service.prototype.cleanContainer = function *() {
	if(yield this.isCreated()) {
		yield docker(['rm', this.name]);
	}
};

Service.prototype.cleanImage = function *() {
	if(yield this.isBuilt()) {
		yield docker(['rmi', this.tag]);
	}
};

Service.prototype.isCreated = function *() {
	var containers = yield docker(['ps', '-a'], true);
	containers = containers.toString().split('\n');

	for(var x = 1; x < containers.length; x++) {
		if(containers[x].indexOf(' ' + this.name) !== -1) return true;
	}

	return false;
};

Service.prototype.isBuilt = function *() {
	var images = yield docker(['images'], true);
	images = images.toString().split('\n');

	for(var x = 1; x < images.length; x++) {
		if(images[x].indexOf(this.tag) !== -1) return true;
	}

	return false;
};

Service.prototype.build = function *() {
	if(fs.existsSync(path.join(this.directory, 'Dockerfile'))) {
		yield docker(['build', '--no-cache', '-t', this.tag, this.directory]);
	} else {
		yield docker(['pull', this.tag]);
	}
};

Service.prototype.create = function *(dependencies) {
	var args = ['create', '--name', this.name];

	var mounts = _(this.mounts).map(function(loc, name) {
		return ['-v', path.join('/' + this.directory, 'mounts', name) + ':' + loc];
	}, this).flatten().value();

	var deps = _(dependencies).map(function(dep) {
		return ['--link', dep + ':' + dep];
	}).flatten().value();

	var configs = _(yield this.getConfigs()).map(function(config) {
		return ['-v', path.join('/' + this.directory, 'config', config) + ':' + config];
	}, this).flatten().value();

	var ports = _(this.ports).map(function(port) {
		return ['-p', port + ':' + port];
	}).flatten().value();

	var timezone = ['-v', '/etc/localtime:/etc/localtime:ro', '-v', '/etc/timezone:/etc/timezone:ro'];
	
	yield docker(args.concat(mounts).concat(timezone).concat(configs).concat(deps).concat(ports).concat([this.tag]));
};

Service.prototype.start = function *() {
	yield systemctl(['start', this.servicename]);
};

Service.prototype.stop = function *() {
	yield systemctl(['stop', this.servicename]);
};

Service.prototype.restart = function *() {
	yield systemctl(['restart', this.servicename]);
};

module.exports = Service;
