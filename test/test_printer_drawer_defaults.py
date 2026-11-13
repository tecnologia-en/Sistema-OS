
"""Drawer defaults for receipt drivers; no workstation access."""
import importlib.machinery
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
loader=importlib.machinery.SourceFileLoader("drawer_defaults",str(ROOT/"config/includes.chroot/usr/local/sbin/enfoque-thermal-print"))
spec=importlib.util.spec_from_loader(loader.name,loader)
thermal=importlib.util.module_from_spec(spec)
loader.exec_module(thermal)

class DrawerDefaults(unittest.TestCase):
    def test_bematech_pin2_after_and_pin5_disabled(self):
        opts={"Drawer":["Off","Begin","End"],"Drawer2":["Off","Begin","End"]}
        self.assertEqual(thermal.drawer_options(opts),{"Drawer":"End","Drawer2":"Off"})
        self.assertEqual(thermal.desired_options(opts),{"Drawer":"End","Drawer2":"Off"})

    def test_elgin_native_numeric_options(self):
        self.assertEqual(thermal.drawer_options({"Drawer1":["0","1","2"],"Drawer2":["0","1","2"]}),{"Drawer1":"2","Drawer2":"0"})

    def test_i7_native_named_options(self):
        opts={"CashDrawer1Setting":["0NotCashDrawer1","2CashDrawer1AfterPrinting"],"CashDrawer2Setting":["0NotCashDrawer2","2CashDrawer2AfterPrinting"]}
        self.assertEqual(thermal.drawer_options(opts),{"CashDrawer1Setting":"2CashDrawer1AfterPrinting","CashDrawer2Setting":"0NotCashDrawer2"})

    def test_single_drawer(self):
        self.assertEqual(thermal.drawer_options({"Drawer":["Off","End"]}),{"Drawer":"End"})

    def test_unsupported_or_incomplete_families_are_untouched(self):
        for opts in [{},{"Drawer":["Off","Begin"],"Drawer2":["Off","End"]},{"Drawer1":["0","2"]},{"Drawer":["Off","End"],"Drawer2":["0","2"]}]:
            self.assertEqual(thermal.drawer_options(opts),{})

    def test_library_thermal_filters_keep_the_trimmer(self):
        for name in ("enfoque-lib-elgin125-raster","enfoque-lib-bematech-raster"):
            ppd='*cupsFilter: "application/vnd.cups-raster 100 '+name+'"\n'
            patched,original=thermal.patch_ppd(ppd)
            self.assertEqual(original,name)
            self.assertIn('enfoque-thermal-raster',patched)
            self.assertIn(name,patched)

    def test_existing_cutter_policy_preserved(self):
        selected=thermal.desired_options({"CutMode":["0","1"],"Drawer":["Off","End"],"Drawer2":["Off","End"]})
        self.assertEqual(selected,{"CutMode":"1","Drawer":"End","Drawer2":"Off"})

if __name__=="__main__":unittest.main()
