var gulp = require('gulp'),
	ts = require('gulp-typescript'),
	concat = require('gulp-concat'),
	spawn = require('child_process').spawn;

var nodeServer;

const COMPONENT_PATH = './bower_components/';
const SOURCE_PATH = './src/';
const DIST_PATH = './dist/';
const DIST_CLIENT_PATH = DIST_PATH + 'client/';

gulp.task('default', ['vendor-styles', 'vendor-scripts', 'ts', 'copy', 'watch']);

gulp.task('vendor-scripts', function()
{
	stream = gulp.src([
		COMPONENT_PATH + 'underscore/underscore-min.js',
		COMPONENT_PATH + 'jquery/dist/jquery.min.js',
		COMPONENT_PATH + 'bootstrap/dist/js/bootstrap.min.js',
		COMPONENT_PATH + 'handlebars/handlebars.min.js',
		COMPONENT_PATH + 'backbone/backbone.js',
		COMPONENT_PATH + 'marionette/lib/backbone.marionette.js',
		COMPONENT_PATH + 'socket.io-client/socket.io.js'
	])
	.pipe(concat('vendor.js'));
	stream.pipe(gulp.dest(DIST_CLIENT_PATH));
});

gulp.task('vendor-styles', function()
{
	stream = gulp.src([
		COMPONENT_PATH + 'bootstrap/dist/css/bootstrap.min.css',
	])
	.pipe(concat('vendor.css'));
	stream.pipe(gulp.dest(DIST_CLIENT_PATH));
});

// Compile TypeScript sources
gulp.task('ts', function()
{
	const compilerConfig = {module: 'commonjs', sourceMap: true, removeComments: true};
	gulp.src([SOURCE_PATH + 'server.ts'])    .pipe(ts(compilerConfig)).js.pipe(gulp.dest(DIST_PATH));
	gulp.src([SOURCE_PATH + 'client/app.ts']).pipe(ts(compilerConfig)).js.pipe(gulp.dest(DIST_CLIENT_PATH));
});

gulp.task('copy', function()
{
	return gulp.src(SOURCE_PATH + 'client/app.html').pipe(gulp.dest(DIST_CLIENT_PATH));
});

gulp.task('watch', function()
{  
	gulp.watch(SOURCE_PATH + '**/*.ts', ['ts']);
	gulp.watch(SOURCE_PATH + 'client/app.html', ['copy']);

	gulp.watch(DIST_PATH + 'server.js', ['server']);
});

gulp.task('server', function(cb)
{
	if (nodeServer) nodeServer.kill();
	nodeServer = spawn('node', [DIST_PATH + 'server.js'], { stdio: 'inherit' });
	nodeServer.on('close', function(code)
	{
		if (code === 8)
			gulp.log('Error detected, waiting for changes...');
	});
});
