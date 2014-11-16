Docker Service Manager
======================

This tool allows the user to manage services run within docker containers. I created this tool out of the neccesity to have a multitude of services running on a single private server. These services might at times depend on each other and each expose different ports.

After messing around with virtual machines for quite some time, I finally settled on running each service in its own docker container. This application helps me (and maybe you), to easily mount folders and config files, to expose neccessary ports and to build and start all neccessary images and containers.

Structure of a Service
----------------------
Each service lives inside its own folder. This folder may be located anywhere, and will be symlinked into `~/.docker-services` by using

	$ docker-service add /some/services/folder

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
An array defining the ports this service will expose to you. This should not contain any ports needed for services to communicate with each other.

#### mounts
Define names for any directories which need to be mounted into your services container. See about the mounts directory below.

#### deps
An array listing all dependencies of this service. These dependencies will be started before loading up your service.

### `mounts` directory
You should symlink your mounts here under the name defined in your `service.json`. This allows you to check in the required mounts to git, while easily assigning them on each machine.
If you have no mounts, you do not need this directory.

### `config` directory
This directory contains any configuration files for your service. These are linked into the services container, so you may change them without the need to mess without much fuss.
You should treat this directory like a linux systems root folder. So `mounts/etc/something.conf` will be linked to `/etc/something.conf` inside the container.
If you have no configuration files, you may omit this folder.

CLI
---
The application exposes the following commands:

### docker-service add \<path\>
Adds a new service from a directory

### docker-service remove \<name\>
Removes the given service, including any images and containers.

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

Errors
------
This application does NOT print user-friendly error messages. If anything goes wrong (e.g. a dependency is missing), it just throws an error and crashes. The error messages should be self-explanatory though.
