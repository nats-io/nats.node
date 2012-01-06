TESTS = test/*.js

test:
	@./node_modules/.bin/mocha \
	  --require should \
	  --reporter list \
	  --slow 250 \
	  --timeout 10000 \
	  $(TESTS)

.PHONY: test

