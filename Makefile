TESTS = test/*.js


lint:
	./node_modules/.bin/jshint ./test ./index.js ./lib/nats.js

test:
	@./node_modules/.bin/mocha \
	  --require should \
	  --reporter list \
	  --slow 500 \
	  --timeout 10000 \
	  $(TESTS)

.PHONY: test

