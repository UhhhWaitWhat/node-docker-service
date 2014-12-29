var FS = require('fs-mock');
var sinon = require('sinon');
var rewire = require('rewire');
var trequire = require('trequire');

var dir = '/some/directory';
var reset = [];
var Service = rewire('../lib/service.js');

function prepareFS(json, dockerfile, config, mounts) {
	json = json || {};
	json.tag = 'user/tag';

	var struct = {};
	var root = struct[dir.substring(1)] = {
		"service.json": JSON.stringify(json)
	};

	if(dockerfile) root.Dockerfile = '';
	if(config) root.config = {
		'some': {
			'config1': 'ABC',
			'config2': 'DEF',
			'other': {
				'config': {},
				'folders': {}
			},
			'empty': {}
		}
	};
	if(mounts) {
		root.mounts = {};
		for(var mount in json.mounts) {
			root.mounts[mount] = '';
		}
	}

	return Service.__set__('fs', trequire(new FS(struct)));
}

function prepareDocker(stub, data) {
	return Service.__set__('docker', stub.returns(function(cb) {
		cb(null, data);
	}));
}

function ServiceMock(spy) {
	var self = this;
	['start'].forEach(function(prop) {
		self[prop] = function *() {
			spy(prop);
		};
	});
}

describe('A Service Object', function() {
	afterEach(function() {
		while(reset[0]) {
			reset.pop()();
		}
	});

	describe('can be instantiated and', function() {
		describe('assigns', function() {
			beforeEach(function() {
				reset.push(prepareFS({
					deps: ['some', 'dependencies'],
					ports: [2000, 3000],
					mounts: {
						'some': 'mount'
					}
				}));
			});

			it('services ', function() {
				var services = ['some', 'services'];

				var service = new Service(dir, services);
				service.services.must.be(services);
			});

			it('tag ', function() {
				var service = new Service(dir, {});
				service.tag.must.be('user/tag');
			});

			it('dependencies ', function() {
				var service = new Service(dir, {});
				service.deps.must.eql(['some', 'dependencies']);
			});

			it('ports ', function() {
				var service = new Service(dir, {});
				service.ports.must.eql([2000, 3000]);
			});

			it('mounts ', function() {
				var service = new Service(dir, {});
				service.mounts.must.eql({
					'some': 'mount'
				});
			});
		});

		describe('assigns name correctly if a name', function() {
			it('is supplied', function() {
				reset.push(prepareFS({name: 'name'}));

				var service = new Service(dir, {});
				service.name.must.be('name');
			});

			it('is missing', function() {
				reset.push(prepareFS());

				var service = new Service(dir, {});
				service.name.must.be('tag');
			});
		});

		describe('detects config correctly if it', function() {
			it('exists', function() {
				reset.push(prepareFS({}, false, true));

				var service = new Service(dir, {});
				service.config.must.be.true();
			});

			it('is missing', function() {
				reset.push(prepareFS());

				var service = new Service(dir, {});
				service.config.must.be.false();
			});
		});

		describe('detects dockerfile correctly if it', function() {
			it('exists', function () {
				reset.push(prepareFS({}, true));

				var service = new Service(dir, {});
				service.dockerfile.must.be.true();
			});

			it('is missing', function() {
				reset.push(prepareFS());

				var service = new Service(dir, {});
				service.dockerfile.must.be.false();
			});
		});
	});

	describe('provides the method', function() {
		describe('missingMounts() which works if', function() {
			it('we have no mounts', function *() {
				reset.push(prepareFS());

				var service = new Service(dir, {});
				var mounts = yield service.missingMounts();
				mounts.length.must.be(0);
			});

			it('we have a missing mount', function *() {
				reset.push(prepareFS({mounts:{'some': 'mount'}}));

				var service = new Service(dir, {});
				var mounts = yield service.missingMounts();
				mounts.length.must.be(1);
				mounts[0].must.be('mount');
			});

			it('we have existing mounts', function *() {
				reset.push(prepareFS({mounts:{'some': 'mount'}}, false, false, true));

				var service = new Service(dir, {});
				var mounts = yield service.missingMounts();
				mounts.length.must.be(0);
			});
		});

		describe('missingDeps() which works if', function() {
			it('we have no dependencies', function *() {
				reset.push(prepareFS({deps: []}));

				var services = {};
				var service = new Service(dir, services);

				services.tag = service;

				var deps = yield service.missingDeps();
				deps.length.must.be(0);
			});

			it('we have existing dependencies', function *() {
				reset.push(prepareFS({deps: ['dep']}));

				var services = {};
				var service = new Service(dir, services);

				services.dep = true;
				services.tag = service;

				var deps = yield service.missingDeps();
				deps.length.must.be(0);
			});

			it('we miss dependencies', function *() {
				reset.push(prepareFS({deps: ['dep']}));

				var services = {};
				var service = new Service(dir, services);

				services.tag = service;

				var deps = yield service.missingDeps();
				deps.length.must.be(1);
				deps[0].must.be('dep');
			});
		});

		describe('isRunning() which works if', function() {
			it('the container is running', function *() {
				var stub = sinon.stub();
				reset.push(prepareDocker(stub, 'Header with name\ncontains name'));
				reset.push(prepareFS({name: 'name'}));

				var service = new Service(dir, {});
				var running = yield service.isRunning();

				running.must.be.true();
				stub.calledWith(['ps']).must.be.true();
			});

			it('the container is stopped', function *() {
				var stub = sinon.stub();
				reset.push(prepareDocker(stub, 'Header with name\ncontains something else'));
				reset.push(prepareFS());

				var service = new Service(dir, {});
				var running = yield service.isRunning();

				running.must.be.false();
				stub.calledWith(['ps']).must.be.true();
			});
		});

		describe('isBuilt() which works if', function() {
			it('the container exists', function *() {
				var stub = sinon.stub();
				reset.push(prepareDocker(stub, 'Header with name\ncontains name'));
				reset.push(prepareFS({name: 'name'}));

				var service = new Service(dir, {});
				var built = yield service.isBuilt();

				built.must.be.true();
				stub.calledWith(['ps -a']).must.be.true();
			});

			it('the container is missing', function *() {
				var stub = sinon.stub();
				reset.push(prepareDocker(stub, 'Header with name\ncontains something else'));
				reset.push(prepareFS());

				var service = new Service(dir, {});
				var built = yield service.isBuilt();

				built.must.be.false();
				stub.calledWith(['ps -a']).must.be.true();
			});
		});

		describe('hasImage() which works if', function() {
			it('the image exists', function *() {
				var stub = sinon.stub();
				reset.push(prepareDocker(stub, 'Header with name\ncontains user/tag'));
				reset.push(prepareFS());

				var service = new Service(dir, {});
				var image = yield service.hasImage();

				image.must.be.true();
				stub.calledWith(['images']).must.be.true();
			});

			it('the image is missing', function *() {
				var stub = sinon.stub();
				reset.push(prepareDocker(stub, 'Header with name\ncontains something else'));
				reset.push(prepareFS());

				var service = new Service(dir, {});
				var image = yield service.hasImage();

				image.must.be.false();
				stub.calledWith(['images']).must.be.true();
			});
		});

		describe('startDeps() which', function() {
			it('calls start on all dependencies', function *() {
				var spy = sinon.spy();
				reset.push(prepareFS({deps: ['dep1', 'dep2']}));

				var services = {
					dep1: new ServiceMock(spy),
					dep2: new ServiceMock(spy)
				};
				var service = new Service(dir, services);

				yield service.startDeps();
				spy.calledTwice.must.be.true();
				spy.firstCall.args[0].must.be('start');
				spy.secondCall.args[0].must.be('start');
			});

			it('does not call anything else', function *() {
				var spy = sinon.spy();
				reset.push(prepareFS({deps: ['dep1']}));

				var services = {
					dep1: new ServiceMock(spy),
					dep2: new ServiceMock(spy)
				};
				var service = new Service(dir, services);

				yield service.startDeps();
				spy.calledOnce.must.be.true();
				spy.calledWith('start').must.be.true();
			});
		});

		describe('resume() which', function() {
			it('calls docker start', function *() {
				var stub = sinon.stub();
				reset.push(prepareFS());
				reset.push(prepareDocker(stub));

				var service = new Service(dir, {});

				yield service.resume();
				stub.calledOnce.must.be.true();
				stub.calledWith(['start', 'tag']).must.be.true();
			});
		});

		describe('build() which', function() {
			it('calls docker build if we have a dockerfile', function *() {
				var stub = sinon.stub();
				reset.push(prepareFS({}, true));
				reset.push(prepareDocker(stub));

				var service = new Service(dir, {});

				yield service.build();
				stub.calledOnce.must.be.true();
				stub.calledWith(['build -t', 'user/tag', '/some/directory']).must.be.true();
			});

			it('calls docker pull if we do not have a dockerfile', function *() {
				var stub = sinon.stub();
				reset.push(prepareFS());
				reset.push(prepareDocker(stub));

				var service = new Service(dir, {});

				yield service.build();
				stub.calledOnce.must.be.true();
				stub.calledWith(['pull', 'user/tag']).must.be.true();
			});
		});

		describe('getConfigs() which', function() {
			describe('returns correct configs and folders', function() {
				it('when no folders are defined', function *() {
					reset.push(prepareFS({}, false, true));

					var service = new Service(dir, {});
					var configs = yield service.getConfigs();

					configs.must.contain('some/config1');
					configs.must.contain('some/config2');
				});

				it('when no overlap exists', function *() {
					reset.push(prepareFS({configs: {
						'some/other': {
							config: {
								folders: {},
								oneMore: {}
							},
							empty: {}
						}
					}}, false, true));

					var service = new Service(dir, {});
					var configs = yield service.getConfigs();

					configs.must.contain('some/other/config/folders');
					configs.must.contain('some/other/config/oneMore');
					configs.must.contain('some/other/empty');

					configs.must.contain('some/config1');
					configs.must.contain('some/config2');
				});

				it('when overlap exists', function *() {
					reset.push(prepareFS({configs: {
						'some': {}
					}}, false, true));

					var service = new Service(dir, {});
					var configs = yield service.getConfigs();

					configs.must.contain('some');
					configs.must.not.contain('some/config1');
					configs.must.not.contain('some/config2');
				});

				it('throws if folder does not exist', function *() {
					reset.push(prepareFS({configs: {
						'someNonExistent': {}
					}}));

					//We cannot use .must.throw because we have a generator function
					var thrown;
					try {
						service.getConfigFolders.must.throw();
					} catch(e) {
						thrown = e;
					}

					thrown.must.be.instanceof(Error);
				});
			});
		});

		describe('remove() which', function() {
			var service, stub = sinon.stub();
			beforeEach(function() {
				stub.reset();
				reset.push(prepareFS({name: 'name'}));
				reset.push(prepareDocker(stub));
				service = new Service(dir, {});
			});

			it('stops the container if needed', function *() {
				service.isRunning = function *() {
					return true;
				};
				service.isBuilt = function *() {
					return true;
				};

				yield service.remove();

				stub.calledThrice.must.be.true();
				stub.calledWith(['stop', 'name']).must.be.true();
				stub.calledWith(['rm', 'name']).must.be.true();
				stub.calledWith(['rmi', 'user/tag']).must.be.true();
			});

			it('removes the container if needed', function *() {
				service.isRunning = function *() {
					return false;
				};
				service.isBuilt = function *() {
					return true;
				};

				yield service.remove();

				stub.calledTwice.must.be.true();
				stub.calledWith(['rm', 'name']).must.be.true();
				stub.calledWith(['rmi', 'user/tag']).must.be.true();
			});

			it('removes the image', function *() {
				service.isRunning = function *() {
					return true;
				};
				service.isBuilt = function *() {
					return true;
				};

				yield service.remove();

				stub.calledThrice.must.be.true();
				stub.calledWith(['rmi', 'user/tag']).must.be.true();
			});
		});

		describe('start() which', function() {
			var service, spy = sinon.spy();
			beforeEach(function() {
				spy.reset();
				reset.push(prepareFS());
				service = new Service(dir, {});
				service.startDeps = function *() {
					spy('startDeps');
				};
			});

			it('throws on missing mounts', function *() {
				service.missingMounts = function *() {
					return ['some', 'mounts'];
				};

				try {
					yield service.start();
					false.must.be.true();
				} catch(e) {}
			});

			it('throws on missing dependencies', function *() {
				service.missingDeps = function *() {
					return ['some', 'mounts'];
				};

				try {
					yield service.start();
					false.must.be.true();
				} catch(e) {}
			});

			it('does nothing if running', function *() {
				service.isRunning = function *() {
					return true;
				};

				service.start();
				spy.called.must.be.false();
			});

			describe('if not running', function() {
				beforeEach(function() {
					service.isRunning = function *() {
						return false;
					};
				});

				describe('and the container is built', function() {
					beforeEach(function() {
						service.isBuilt = function *() {
							return true;
						};

						service.resume = function *() {
							spy('resume');
						};
					});

					it('starts dependencies', function *() {
						yield service.start();
						spy.calledWith('startDeps').must.be.true();
					});

					it('resumes the container', function *() {
						yield service.start();
						spy.calledWith('resume').must.be.true();
					});
				});

				describe('and the container is not built', function() {
					beforeEach(function() {
						service.isBuilt = function *() {
							return false;
						};
					});

					describe('and an image exists', function() {
						beforeEach(function() {
							service.hasImage = function *() {
								return true;
							};

							service.run = function *() {
								spy('run');
							};
						});

						it('starts dependencies', function *() {
							yield service.start();
							spy.calledWith('startDeps').must.be.true();
						});

						it('runs the service', function *() {
							yield service.start();
							spy.calledWith('run').must.be.true();
						});
					});

					describe('and no image exists', function() {
						beforeEach(function() {
							service.hasImage = function *() {
								return false;
							};

							service.build = function *() {
								spy('build');
							};

							service.run = function *() {
								spy('run');
							};
						});

						it('starts dependencies', function *() {
							yield service.start();
							spy.calledWith('startDeps').must.be.true();
						});

						it('builds the image', function *() {
							yield service.start();
							spy.calledWith('build').must.be.true();
						});

						it('runs the service', function *() {
							yield service.start();
							spy.calledWith('run').must.be.true();
						});
					});
				});
			});
		});

		describe('stop() which', function() {
			var service, stub = sinon.stub();
			beforeEach(function() {
				stub.reset();
				reset.push(prepareFS({name: 'name'}));
				reset.push(prepareDocker(stub));
				service = new Service(dir, {});
			});

			it('calls docker stop if needed', function *() {
				service.isRunning = function *() {
					return true;
				};

				yield service.stop();
				stub.calledOnce.must.be.true();
				stub.calledWith(['stop', 'name']).must.be.true();
			});

			it('does nothing if already stopped', function *() {
				service.isRunning = function *() {
					return false;
				};

				yield service.stop();
				stub.called.must.be.false();
			});
		});

		describe('restart() which', function() {
			it('restarts the service', function *() {
				reset.push(prepareFS());

				var spy = sinon.spy();
				var service = new Service(dir, {});
				service.stop = function *() { spy('stop'); };
				service.start = function *() { spy('start'); };

				yield service.restart();
				spy.calledTwice.must.be.true();
				spy.calledWith('stop').must.be.true();
				spy.calledWith('start').must.be.true();
			});
		});

		describe('rebuild() which', function() {
			it('removes and restarts the service', function *() {
				reset.push(prepareFS());

				var spy = sinon.spy();
				var service = new Service(dir, {});
				service.remove = function *() { spy('remove'); };
				service.start = function *() { spy('start'); };

				yield service.rebuild();
				spy.calledTwice.must.be.true();
				spy.calledWith('remove').must.be.true();
				spy.calledWith('start').must.be.true();
			});
		});

		describe('run() which', function() {
			var line;
			before(function *() {
				var stub = sinon.stub();
				reset.push(prepareDocker(stub));
				reset.push(prepareFS({
					deps: ['dep1', 'dep2'],
					mounts: {'mount1': '/some/mount1', 'mount2': '/some/mount2'},
					ports: [1000, 2000],
					configs: {
						'some/other': {
							config: {
								folders: {},
								oneMore: {}
							},
							empty: {}
						}
					}
				}, true, true));

				var services = {dep1: true, dep2: true};
				var service = new Service(dir, services);

				yield service.run();
				line = stub.firstCall.args[0].join(' ');
			});

			describe('calls docker run', function() {
				it('on the correct image', function() {
					line.substring(0, 3).must.be('run');
					line.substring(line.length-8).must.be('user/tag');
				});

				it('in deamon mode', function() {
					line.must.contain(' -d ');
				});

				it('with correct name', function() {
					line.must.contain(' --name tag ');
				});

				it('with correct mounts', function() {
					line.must.contain(' -v ' + dir + '/mounts/mount1:/some/mount1 ');
					line.must.contain(' -v ' + dir + '/mounts/mount2:/some/mount2 ');
				});

				it('with correct ports', function() {
					line.must.contain(' -p 1000:1000 ');
					line.must.contain(' -p 2000:2000 ');
				});

				it('with correct configs', function() {
					line.must.contain(' -v ' + dir + '/config/some/config1:/some/config1');
					line.must.contain(' -v ' + dir + '/config/some/config2:/some/config2');
					line.must.contain(' -v ' + dir + '/config/some/other/config/folders:/some/other/config/folders');
					line.must.contain(' -v ' + dir + '/config/some/other/config/oneMore:/some/other/config/oneMore');
					line.must.contain(' -v ' + dir + '/config/some/other/empty:/some/other/empty');
				});

				it('with mounts to take the hoststimezone', function() {
					line.must.contain(' -v /etc/localtime:/etc/localtime:ro');
					line.must.contain(' -v /etc/timezone:/etc/timezone:ro');
				});
			});
		});
	});
});
