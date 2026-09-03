PREFIX ?= $(HOME)/bin
TARGET := $(PREFIX)/gitdiff3d
SOURCE := $(CURDIR)/bin/gitdiff3d.js

.PHONY: install uninstall check

install:
	@mkdir -p $(PREFIX)
	@chmod +x $(SOURCE)
	@ln -sf $(SOURCE) $(TARGET)
	@echo "linked $(TARGET) -> $(SOURCE)"

uninstall:
	@rm -f $(TARGET)
	@echo "removed $(TARGET)"

check:
	@node -e 'require("./src/parse-diff");require("./src/layout");require("./src/structure");require("./src/server");require("./src/git");console.log("modules load")'
	@node bin/gitdiff3d.js --help > /dev/null && echo "cli responds"
