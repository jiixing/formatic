'use strict';

var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();

var requireDir = require('require-dir');

requireDir('./tasks');

gulp.task('lint', function () {
  return gulp.src(['gulpfile.js', 'lib/**/*.js'])
    .pipe(plugins.eslint())
    .pipe(plugins.eslint.format());
});

gulp.task('test-watch', function () {
  gulp.watch(['./formatic-dev.js', './__tests__/**/*.js'], ['test']);
});

gulp.task('watch', ['bundle-watch', 'test-watch']);

gulp.task('build', ['build-dev', 'build-prod']);

gulp.task('live', ['watch', 'server-live-app', 'server-live-reload']);

gulp.task('test', ['lint'], plugins.shell.task([
  'npm test'
]));

gulp.task('default', ['build']);
