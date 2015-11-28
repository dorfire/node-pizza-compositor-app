var gulp = require('gulp'),
	ts = require('gulp-typescript'),
	concat = require('gulp-concat');

const COMPONENT_PATH = './bower_components/'
const SOURCE_PATH = './src/';
const DIST_PATH = './dist/';

gulp.task('default', ['vendor-styles', 'vendor-scripts', 'ts', 'copy', 'watch']);

gulp.task('vendor-scripts', function() {
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
	stream.pipe(gulp.dest(DIST_PATH));
});

gulp.task('vendor-styles', function() {
	stream = gulp.src([
		COMPONENT_PATH + 'bootstrap/dist/css/bootstrap.min.css',
	])
	.pipe(concat('vendor.css'));
	stream.pipe(gulp.dest(DIST_PATH));
});

// Compile TypeScript sources
gulp.task('ts', function() {  
	gulp.src([SOURCE_PATH + 'server.ts', SOURCE_PATH + 'app/app.ts'])
		.pipe(ts({module: 'commonjs', sourceMap: true, removeComments: true}))
		.js
		.pipe(gulp.dest(DIST_PATH));
});

gulp.task('copy', function() {
	return gulp.src(SOURCE_PATH + 'app.html').pipe(gulp.dest(DIST_PATH));
});

gulp.task('watch', function() {  
	gulp.watch(SOURCE_PATH + '**/*.ts', ['ts']);
	gulp.watch(SOURCE_PATH + 'app.html', ['copy']);
});
