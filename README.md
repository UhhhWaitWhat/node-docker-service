Docker Service Manager
======================
[![Build Status](https://img.shields.io/travis/PaulAvery/node-docker-service.svg?style=flat)](https://travis-ci.org/PaulAvery/node-docker-service)
** Warning ** The badge above only represents linting results at the moment due to missing time to write tests. They will hopefully return at some point in the not-so-far future.

** Warning: ** This version (`>= 3.0.0`) breaks compatibility with previous versions entirely by moving to a systemd only philosophy. Reasoning behind this is, that this is a project mainly for my own use and I aim to deploy this on systemd based systems only. If you want a system which works without systemd, use (or fork) version [2.0.0](tree/fd37f83fdd409827f9aea2eccf5d06e6b55bd50d).

This tool allows the user to manage services run within docker containers. I created this tool out of the neccesity to have a multitude of services running on a single private server. These services might at times depend on each other and each expose different ports.

After messing around with virtual machines for quite some time, I finally settled on running each service in its own docker container. This application helps me (and maybe you), to easily mount folders and config files, to expose neccessary ports and to build and start all neccessary images and containers.

It also takes care of setting the containers timezone, so no time mismatches happen between the service and the host.

Structure of a Service
----------------------
Each service lives inside its own folder. This folder may be located anywhere, and will be symlinked into `/etc/docker-services` by using

	$ docker-service add /some/services/folder

This folder will not be deleted upon uninstalling this module, so you should take care of this on your own!

### service.json
A service contains at its heart a `service.json` file, which may look like this:

	{
		"tag": "paulavery/ympd",
		"name": "ympd",
		"ports": [
			8000
		],
		"mounts": {
			"music": "/etc/mopidy/music"
		},
		"deps": [
			"mpd"
		]
	}

All its attributes are optional with the exception of a `tag` which we require.

#### tag
If a local Dockerfile is found, a new image will be built from it, under this tag.
Otherwise, the tag will be pulled from the docker registry.

#### name
A name to later be used as the services container name. You will use this to reference services (start or stop them as well as have other services depend on them).

If omitted it will default to the part behind the `/` of your `tag`.
I would suggest to use this property to allow for drop-in replacements of dependencies (e.g. a `mopidy` and an `mpd` service could both have different tags but the name `mpd`, as they are providing the same service for dependents).

#### ports
An array defining the ports this service will expose to you. This should not contain any ports not exposed to the user.

#### mounts
Define names for any directories which need to be mounted into your services container. See about the mounts directory below.

#### deps
An array listing all dependencies of this service. These dependencies will be linked into this service.

#### dept
An array listing all dependants of this service.
This service will be linked into all dependants.

#### optDeps
An array listing optional dependencies of this service.

#### optDept
An array listing optional dependants of this service.

### `mounts` directory
You should symlink your mounts here under the name defined in your `service.json`. This allows you to check in the required mounts to git, while easily assigning them on each machine.
If you have no mounts, you do not need this directory.

### `config` directory
This directory contains any configuration files for your service. These are linked into the services container, so you may change them without much fuss.
You should treat this directory like a linux systems root folder. So `config/etc/something.conf` will be linked to `/etc/something.conf` inside the container.
If you have no configuration files, you may omit this folder.

In addition, you may specify entire folders in your `service.json`'s `configs` property. The following would mount `config/home/sabnzbd/.sabnzbd` and `config/home/sabnzbd/downloads` to `/home/sabnzbd/.sabnzbd` and `/home/sabnzbd/downloads` respectively:

	{
		configs: {
			'home/sabnzbd': {
				'.sabnzbd': {},
				'downloads': {}
			}
		}
	}

Single files will still be mounted seperately **unless** they are positioned in a folder which will be mounted.


Rebuilding Containers
---------------------
Whenever a service is added or removed, all containers will be rebuild. This means that all data not stored within any `mount` or `config` directory will be **LOST**. This is by design, as a


CLI
---
The Application creates systemd services representing each service. The main cli commands below mostly just call systemctl.
The application exposes the following commands:

### docker-service add \<path\>
Adds a new service from a directory. Also adds the neccessary systemd service file.

### docker-service remove \<name\>
Removes the given service, including any images and containers as well as the systemd service

### docker-service start \<name\>
Builds any neccessary images and containers as well as starting all dependencies before starting up your service. First time doing this might take some time.

### docker-service stop \<name\>
Stops the container running your service

### docker-service restart \<name\>
Restarts a service.

### docker-service status \<name\>
Prints status information as json to the command line.

### docker-service list
Lists all installed services with their current status.

### docker-service rebuild
Stops and destroys all running containers before rebuilding them.

API
---
The module exports a `ServiceManager` object, which can be instantiated with a path as its only argument:

	var services = new ServiceManager('/etc/docker-services');

The path determines from which directory to read the services and where to symlink new services to.

### ServiceManager
#### ServiceManager.services
An object containing key=>value pairs of all services. To get a list do `Object.keys(sm.services)`.

#### ServiceManager.add(path)
*Generator Function*
Links a new service into your root folder and rebuilds all services.

#### ServiceManager.remove(name)
*Generator Function*
Stops the container, deletes the image and removes the systemd service. Also unlinks from the folder.

#### ServiceManager.rebuild()
*Generator Function*
Rebuilds all services.

#### ServiceManager.get()
Returns the service by a given name or throws an error otherwise.

### Service
A representation of a service. These provide a plethora of methods, but I cannot guarantee the interface to remain stable so unless you want to use a VERY specific version of this library, only use `.start()`, `.stop()` and `.restart()`.

#### Service.{start, stop, restart}()
*Generator Functions*
Wrappers around systemctl calls. Logs results to stdout.

Errors
------
This application does NOT print user-friendly error messages. If anything goes wrong, it just throws an error and crashes. The error messages should be self-explanatory though.


TODO
----
* Volume dependencies, so services can share volumes easily
* Tests (used to have them, not done yet due to rewrite and missing time). The badge only represents linting results right now