#!/usr/bin/env node
var co = require('co');
var pkg = require('../package.json');
var services = require('../index.js');

var app = require('commander');

app.version(pkg.version);

app.command('list')
	.description('List all installed services')
	.action(function() {
		co(services.list)(function(err, data) {
			if(err) throw err;
			console.log(data.join('\n'));
		});
	});

app.command('status <name>')
	.description('Retrieve infos about a service')
	.action(function(name) {
		co(services.status(name))(function(err, data) {
			if(err) throw err;
			console.log(data);
		});
	});

app.command('add <path>')
	.description('Add a new service')
	.action(function(path) {
		co(services.add(path))(function(err, service) {
			if(err) throw err;
			console.log(service.name);
		});
	});

app.command('remove <service>')
	.description('Remove a service')
	.action(function(name) {
		co(services.remove(name))(function(err) {
			if(err) throw err;
		});
	});

app.command('start <service>')
	.description('Start a service')
	.action(function(name) {
		co(function *() {
			var service = yield services.get(name);
			yield service.start();
		})(function(err) {
			if(err) throw err;
		});
	});

app.command('stop <service>')
	.description('Stop a service')
	.action(function(name) {
		co(function *() {
			var service = yield services.get(name);
			yield service.stop();
		})(function(err) {
			if(err) throw err;
		});
	});

app.command('restart <service>')
	.description('Restart a service')
	.action(function(name) {
		co(function *() {
			var service = yield services.get(name);
			yield service.restart();
		})(function(err) {
			if(err) throw werr;
		});
	});

app.parse(process.argv);
