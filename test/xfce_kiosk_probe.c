/* Isolated Debian 13 XFCE lockdown verification (no display server needed). */
#include <stdio.h>
#include <xfconf/xfconf.h>

int main(void) {
    setvbuf(stdout,NULL,_IONBF,0);
    GError *error = NULL;
    if (!xfconf_init(&error)) {
        fprintf(stderr,"Cannot initialize xfconf: %s\n", error ? error->message : "unknown");
        g_clear_error(&error);
        return 2;
    }
    const char *items[][2] = {
        {"xfce4-panel","/panels/panel-1/size"},
        {"xfce4-panel","/plugins/plugin-1/items"},
        {"xsettings","/Net/IconThemeName"},
        {"xsettings","/Net/ThemeName"},
        {"xfwm4","/general/theme"},
        {"xfce4-desktop","/desktop-icons/style"},
        {"xfce4-desktop","/backdrop/single-workspace-mode"}
    };
    int failure = 0;
    for (unsigned i=0; i<sizeof(items)/sizeof(items[0]); i++) {
        XfconfChannel *channel=xfconf_channel_get(items[i][0]);
        gboolean locked=xfconf_channel_is_property_locked(channel,items[i][1]);
        printf("XFCONF_KIOSK_LOCK %s %s locked=%d\n",items[i][0],items[i][1],(int)locked);
        if (!locked) failure=1;
        /* xfconf_channel_get returns a cached singleton: do not unref here. */
    }
    xfconf_shutdown();
    if (failure) {
        fprintf(stderr,"INVALID_POLICY: ordinary user can modify a protected property\n");
        return 11;
    }
    puts("XFCONF_NATIVE_API_LOCK_TEST_PASSED");
    return 0;
}
