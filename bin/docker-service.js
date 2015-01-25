#!/usr/bin/env node
var co = require('co');
var pkg = require('../package.json');
var ServiceManager = require('../lib/service-manager');

var services = new ServiceManager('/etc/docker-services');
var app = require('commander');
app.version(pkg.version);

app.command('list')
	.description('List all installed services')
	.action(function() {
		console.log(Object.keys(services.services).join('\n'));
	});

app.command('rebuild')
	.description('Recreate all containers')
	.action(function() {
		co(services.rebuild())(function(err) {
			if(err) throw err;
		});
	});

app.command('add <path>')
	.description('Add a new service')
	.action(function(path) {
		co(services.add(path))(function(err, service) {
			if(err) throw err;
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
	.action(function(name, opts) {
		co(services.get(name).start())(function(err) {
			if(err) throw err;
		});
	});

app.command('stop <service>')
	.description('Stop a service')
	.action(function(name) {
		co(services.get(name).stop())(function(err) {
			if(err) throw err;
		});
	});

app.command('restart <service>')
	.description('Restart a service')
	.action(function(name) {
		co(services.get(name).restart())(function(err) {
			if(err) throw err;
		});
	});

app.parse(process.argv);