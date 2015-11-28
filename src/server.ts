/// <reference path="../typings/tsd.d.ts" />
import io = require('socket.io');
import _ = require('lodash');
var port: number = process.env.port || 1337;
var server = io(port), ns = server.sockets;

interface IRequest
{
	name: string;
	slices: number;
	approx: boolean;
	toppings: string[];
}

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

	socket.on('upsert', (request: IRequest) => {
		if (request.name)
		{
			console.log('Upserting request:', request);
			pizzaRequests[request.name] = request;
			ns.emit('request', request);
		}
	});
});

console.log(`Running socket.io server at http://localhost:${port}/`);