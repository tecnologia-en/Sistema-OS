"""Release version floor for historical regression suites.

Individual feature tests must keep passing for newer OS versions without
pinning all historical suites to one dated VERSION string.
"""
import re

MINIMUM_VERSION = (0, 2, 52)


def assert_minimum_release(test_case, text):
    match = re.search(r'(?m)^VERSION="([0-9]+[.][0-9]+[.][0-9]+)"$', text)
    test_case.assertIsNotNone(match, "Missing Enfoque OS VERSION")
    version = tuple(int(part) for part in match.group(1).split("."))
    test_case.assertGreaterEqual(version, MINIMUM_VERSION,
                                 "Historical regression requires Enfoque OS 0.2.52 or later")
