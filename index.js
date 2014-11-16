var trequire = require('trequire');
var _ = require('lodash');
var fs = trequire('fs');
var path = require('path');
var Service = require('./lib/service');

var root = path.join(process.env.HOME, '.docker-services');
if(!fs.existsSync(root)) fs.mkdirSync(root);

var services = {};
fs.readdirSync(root).forEach(function(link) {
	var service = new Service(fs.realpathSync(path.join(root, link)), services);
	services[service.name] = service;
});

function *add(pth) {
	var service = new Service(path.resolve(process.cwd(), pth), services);
	if(services[service.name]) throw new Error('Service by that name already exists');

	yield fs.cosymlink(path.resolve(process.cwd(), pth), path.join(root, service.name));
	services[service.name] = service;

	return service;
}

function *list() {
	var result = [];
	var arr = _.toArray(services);

	for(var x = 0; x < arr.length; x++) {
		result.push(((yield arr[x].isRunning()) ? '(Running) ' : '(Stopped) ') + arr[x].name);
	}

	return result.sort();
}

function *status(name) {
	if(!services[name]) throw new Error('No service by that name');
	return yield services[name].toString();
}

function *remove(name) {
	if(!services[name]) throw new Error('No service by that name');
	yield services[name].remove();
	delete services[name];

	yield fs.counlink(path.join(root, name));
}

function *get(name) {
	if(!services[name]) throw new Error('No service by that name');
	return services[name];
}

module.exports = {
	add: add,
	list: list,
	status: status,
	remove: remove,
	get: get
};
