'use strict';

var gulp = require('gulp');
var sh = require('shelljs');
var run = require('run-sequence');

gulp.task('copy-build', ['mkdir-live'], function () {
  sh.cp('-f', './build/formatic-dev.js', './live/lib');
});

gulp.task('copy-build-after-bundle', ['watch-bundle'], function (done) {
  run(
    'copy-build',
    done
  );
});

gulp.task('copy-demo', ['mkdir-live'], function () {
  sh.cp('-f', './demo/*.html', './live');
});

gulp.task('copy-bower', ['mkdir-live'], function () {
  sh.cp('-rf', './demo/bower_components', './live');
});

gulp.task('copy-style', ['mkdir-live'], function () {
  sh.cp('-rf', './style', './live');
});

gulp.task('copy-all', ['copy-build', 'copy-bower', 'copy-demo', 'copy-style']);

gulp.task('copy-all-after-bundle', ['copy-build-after-bundle', 'copy-bower', 'copy-demo', 'copy-style']);

gulp.task('copy-docs-build', ['mkdir-live-docs'], function () {
  sh.cp('-f', './build/formatic-dev.js', './live/formatic/lib');
});

gulp.task('copy-docs-build-after-bundle', ['watch-bundle'], function (done) {
  run(
    'copy-docs-build',
    done
  );
});

gulp.task('copy-docs-assets', ['mkdir-live-docs'], function () {
  sh.cp('-rf', './docs/assets/*', './live/formatic');
});

gulp.task('copy-docs-style', ['mkdir-live-docs'], function () {
  sh.cp('-rf', './style/*.css', './live/formatic/css');
});

gulp.task('copy-docs-all', ['copy-docs-build', 'copy-docs-style', 'copy-docs-assets']);

gulp.task('copy-docs-all-after-bundle', ['copy-docs-build-after-bundle', 'copy-docs-style', 'copy-docs-assets']);
