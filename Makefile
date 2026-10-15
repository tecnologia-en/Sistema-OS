.PHONY: check host iso
check:
	./scripts/check-project.sh
host:
	./scripts/check-host.sh
iso:
	sudo ./scripts/build-iso.sh
