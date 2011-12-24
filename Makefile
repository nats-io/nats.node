TESTS = test/*.js

test:
	@./node_modules/.bin/mocha \
	  --require should \
	  --reporter list \
	  --slow 250 \
	  $(TESTS)

.PHONY: test

