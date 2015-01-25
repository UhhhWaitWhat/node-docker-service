"use strict";
var _ = require('lodash');
var trequire = require('trequire');
var fs = trequire('fs');
var hbs = require('handlebars');
var path = require('path');
var tsort = require('tsort');
var Service = require('./service');

function ServiceManager(directory) {
	this.directory = directory;
	this.template = hbs.compile(fs.readFileSync(path.join(__dirname, '../systemd.hbs'), 'utf8'));

	//Read directory and add services to a store
	this.services = fs.readdirSync(directory).map(function(folder) {
		return new Service(path.join(directory, folder));
	}).reduce(function(store, service) {
		store[service.name] = service;
		return store;
	}, {});
}

ServiceManager.prototype.calculateDependencies = function() {
	var graph = tsort();
	var dependencies = {};
	var dependants = {};

	//Fill dependency object
	for(var name in this.services) {
		graph.add(name);

		this.services[name].deps.forEach(function(dependency) {
			if(!this.services[dependency]) throw new Error('Missing dependency "' + dependency + '" for "' + name + '"');
			dependencies[name] = dependencies[name] || [];
			dependencies[name].push(dependency);
		}, this);

		this.services[name].dept.forEach(function(dependant) {
			if(!this.services[dependant]) throw new Error('Missing dependant "' + dependant + '" for "' + name + '"');
			dependencies[dependant] = dependencies[dependant] || [];
			dependencies[dependant].push(name);
		}, this);

		this.services[name].optDeps.forEach(function(dependency) {
			if(this.services[dependency]) {
				dependencies[name] = dependencies[name] || [];
				dependencies[name].push(dependency);
			}
		}, this);

		this.services[name].optDept.forEach(function(dependant) {
			if(this.services[dependant]) {
				dependencies[dependant] = dependencies[dependant] || [];
				dependencies[dependant].push(name);
			}
		}, this);
	}

	for(var service in dependencies) {
		//Remove duplicate dependencies
		dependencies[service] = _.uniq(dependencies[service]);

		//Add nodes to graph
		dependencies[service].forEach(function(dependency) {
			graph.add(dependency, service);
		});
	}

	//Sort graph and return
	var order;
	try {
		order = graph.sort();
	} catch(e) {
		throw Error('Dependency cycle detected');
	}

	return {
		order: order,
		dependencies: dependencies
	};
};

ServiceManager.prototype.add = function *(pth) {
	var depsBefore = this.calculateDependencies();
	var service = new Service(pth);
	if(this.services[service.name]) throw new Error('Service by this name already exists');
	this.services[service.name] = service;

	//Check validity of new graph and calculate dependencies
	var deps = this.calculateDependencies();
	//Link to root directory and build image
	yield fs.cosymlink(path.join(process.cwd(), pth), path.join(this.directory, service.name));
	yield service.build();

	//Stop all services
	for(let x = depsBefore.order.length-1; x >= 0; x--) {
		yield this.services[depsBefore.order[x]].stop();
		yield this.services[depsBefore.order[x]].cleanContainer();		
	}

	//Rebuild all services
	for(let x = 0; x < deps.order.length; x++) {
		yield this.services[deps.order[x]].create(deps.dependencies[deps.order[x]] || []);
		yield this.systemd(this.services[deps.order[x]].servicename, {
			name: this.services[deps.order[x]].name,
			dependencies: deps.dependencies[deps.order[x]]
		});
	}
};

ServiceManager.prototype.remove = function *(name) {
	var depsBefore = this.calculateDependencies();
	var service = this.get(name);
	delete this.services[name];

	//Check validity of new graph and calculate dependencies
	var deps = this.calculateDependencies();

	//Unlink from root directory
	yield fs.counlink(path.join(this.directory, service.name));
	
	//Stop all services
	for(let x = depsBefore.order.length-1; x >= 0; x--) {
		if(depsBefore.order[x] === service.name) {
			yield service.stop();
			yield service.cleanContainer();
		} else {
			yield this.services[depsBefore.order[x]].stop();
			yield this.services[depsBefore.order[x]].cleanContainer();
		}
	}

	//Rebuild all services
	for(let x = 0; x < deps.order.length; x++) {
		yield this.services[deps.order[x]].create(deps.dependencies[deps.order[x]] || []);
		yield this.systemd(this.services[deps.order[x]].servicename, {
			name: this.services[deps.order[x]].name,
			dependencies: deps.dependencies[deps.order[x]]
		});
	}

	//Remove remaining image and systemd file
	yield service.cleanImage();
	yield fs.counlink(path.join('/etc/systemd/system', service.servicename));
};

ServiceManager.prototype.rebuild = function *() {
	var deps = this.calculateDependencies();

	//Stop all services
	for(let x = deps.order.length-1; x >= 0; x--) {
		yield this.services[deps.order[x]].stop();
		yield this.services[deps.order[x]].cleanContainer();		
	}

	//Rebuild all services
	for(let x = 0; x < deps.order.length; x++) {
		yield this.services[deps.order[x]].create(deps.dependencies[deps.order[x]] || []);
		yield this.systemd(this.services[deps.order[x]].servicename, {
			name: this.services[deps.order[x]].name,
			dependencies: deps.dependencies[deps.order[x]]
		});
	}
};

ServiceManager.prototype.systemd = function *(file, data) {
	yield fs.cowriteFile(path.join('/etc/systemd/system', file),this.template(data));
};

ServiceManager.prototype.get = function(name) {
	if(!this.services[name]) throw new Error('Service by name "' + name + '" does not exist');
	return this.services[name];
};

module.exports = ServiceManager;