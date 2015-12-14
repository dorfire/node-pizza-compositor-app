/// <reference path="../typings/tsd.d.ts" />
import io = require('socket.io');
import _ = require('underscore');

var port: number = process.env['SOCKETIO_PORT'] || 8081;
var server = io(port), ns = server.sockets;

interface IRequest
{
	name: string;
	slices: number;
	approx: boolean;
	toppings: string[];
}

const MAX_PIZZA_REQUESTS = 16;
const MAX_SLICES_IN_REQUEST = 16;

var pizzaRequests: { [name: string]: IRequest } = {};

function broadcastStatus()
{
	ns.emit('status', { connections: ns.sockets.length });
}

ns.on('connection', function(socket)
{
	console.log('+ ' + socket.id);

	broadcastStatus();
	ns.emit('requests', _.values(pizzaRequests));

	socket.on('disconnect', () => {
		console.log('- ' + socket.id);

		delete ns.sockets[socket.id];

		if (ns.sockets.length == 0)
			pizzaRequests = {};
		else broadcastStatus();
	});

	socket.on('upsert', (request: IRequest) => { if (request.name)
	{
		if (request.slices > 0 && _.keys(pizzaRequests).length <= MAX_PIZZA_REQUESTS) // Upsert a new request
		{
			console.log('Upserting request:', request);
			if (request.slices > MAX_SLICES_IN_REQUEST)
				request.slices = MAX_SLICES_IN_REQUEST;
			pizzaRequests[request.name] = request;
			ns.emit('request', request);
		}
		else if (request.name in pizzaRequests) // Delete an existing request
		{
			delete pizzaRequests[request.name];
			ns.emit('delete', request.name);
		}
	}});
});

console.log(`Running socket.io server at localhost:${port}`);