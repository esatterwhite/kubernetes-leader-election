#!/bin/bash
rm -rf coverage .tap
mkdir -p coverage

npm run tap
test=$?

npm run c8:coverage
coverage=$?

cat .tap-out | ./node_modules/.bin/tap-parser -t -f | ./node_modules/.bin/tap-xunit > coverage/test.xml

((exit_code=$test+$coverage))
exit $exit_code
