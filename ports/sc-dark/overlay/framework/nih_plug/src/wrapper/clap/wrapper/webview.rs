//! Single-threaded WebCLAP UI adapter; all parameter edits use the existing CLAP gesture queue.
use super::*;

#[repr(C)]
struct PluginWebview {
    get_uri: unsafe extern "C" fn(*const clap_plugin, *mut c_char, u32) -> i32,
    get_resource: unsafe extern "C" fn(*const clap_plugin, *const c_char, *mut c_char, u32, *const clap_ostream) -> bool,
    receive: unsafe extern "C" fn(*const clap_plugin, *const c_void, u32) -> bool,
}

#[repr(C)]
struct HostWebview {
    send: unsafe extern "C" fn(*const clap_host, *const c_void, u32) -> bool,
}

impl<P: ClapPlugin> Wrapper<P> {
    const WEBVIEW: PluginWebview = PluginWebview {
        get_uri: Self::web_uri,
        get_resource: Self::web_resource,
        receive: Self::web_receive,
    };
    const WEB_GUI: clap_plugin_gui = clap_plugin_gui {
        is_api_supported: Some(Self::web_api), get_preferred_api: Some(Self::web_preferred_api),
        create: Some(Self::web_create), destroy: Some(Self::web_destroy), set_scale: None,
        get_size: Some(Self::web_size), can_resize: Some(Self::web_can_resize),
        get_resize_hints: Some(Self::web_resize_hints), adjust_size: Some(Self::web_adjust_size),
        set_size: Some(Self::web_set_size), set_parent: Some(Self::web_parent),
        set_transient: None, suggest_title: None, show: Some(Self::web_show), hide: Some(Self::web_hide),
    };

    pub(super) fn web_extension(id: &CStr) -> *const c_void {
        if id.to_bytes() == b"clap.webview/3" {
            &Self::WEBVIEW as *const PluginWebview as *const c_void
        } else if id == CLAP_EXT_GUI {
            &Self::WEB_GUI as *const clap_plugin_gui as *const c_void
        } else {
            std::ptr::null()
        }
    }

    unsafe extern "C" fn web_uri(_plugin: *const clap_plugin, uri: *mut c_char, capacity: u32) -> i32 {
        let Some(path) = P::WEBVIEW_URI else { return 0 };
        if capacity > 0 && !uri.is_null() {
            strlcpy(std::slice::from_raw_parts_mut(uri, capacity as usize), path);
        }
        (path.len() + 1) as i32
    }

    unsafe extern "C" fn web_resource(_plugin: *const clap_plugin, _path: *const c_char, _mime: *mut c_char, _capacity: u32, _stream: *const clap_ostream) -> bool {
        // Resources are included as files in the .wclap bundle and served by openDAW.
        false
    }

    unsafe extern "C" fn web_receive(plugin: *const clap_plugin, buffer: *const c_void, size: u32) -> bool {
        if plugin.is_null() || buffer.is_null() || size > 32768 { return false; }
        let wrapper = &*((*plugin).plugin_data as *const Self);
        let message = std::slice::from_raw_parts(buffer as *const u8, size as usize);
        let context = wrapper.this.borrow().upgrade().unwrap().make_gui_context();
        let pending_parameters = !wrapper.output_parameter_events.is_empty();
        let response = wrapper.plugin.lock().webview_message(message, context, pending_parameters);
        if response.is_empty() { return true; }
        let host = &*wrapper.host_callback;
        let extension = (host.get_extension.unwrap())(host, b"clap.webview/3\0".as_ptr() as *const c_char) as *const HostWebview;
        !extension.is_null() && ((*extension).send)(host, response.as_ptr() as *const c_void, response.len() as u32)
    }

    unsafe extern "C" fn web_api(_plugin: *const clap_plugin, api: *const c_char, floating: bool) -> bool {
        !floating && !api.is_null() && CStr::from_ptr(api).to_bytes() == b"webview"
    }
    unsafe extern "C" fn web_preferred_api(_plugin: *const clap_plugin, api: *mut *const c_char, floating: *mut bool) -> bool {
        if api.is_null() || floating.is_null() { return false; }
        *api = b"webview\0".as_ptr() as *const c_char;
        *floating = false;
        true
    }
    unsafe extern "C" fn web_create(plugin: *const clap_plugin, api: *const c_char, floating: bool) -> bool {
        if !Self::web_api(plugin, api, floating) { return false; }
        Self::web_show(plugin)
    }
    unsafe extern "C" fn web_destroy(plugin: *const clap_plugin) { Self::web_hide(plugin); }
    unsafe extern "C" fn web_size(plugin: *const clap_plugin, width: *mut u32, height: *mut u32) -> bool {
        if plugin.is_null() || width.is_null() || height.is_null() { return false; }
        let wrapper = &*((*plugin).plugin_data as *const Self);
        (*width, *height) = wrapper.web_gui_size.load();
        true
    }
    unsafe extern "C" fn web_can_resize(_plugin: *const clap_plugin) -> bool { true }
    unsafe extern "C" fn web_resize_hints(_plugin: *const clap_plugin, hints: *mut clap_gui_resize_hints) -> bool {
        if hints.is_null() { return false; }
        *hints = clap_gui_resize_hints { can_resize_horizontally: true, can_resize_vertically: true,
            preserve_aspect_ratio: false, aspect_ratio_width: 0, aspect_ratio_height: 0 };
        true
    }
    unsafe extern "C" fn web_adjust_size(_plugin: *const clap_plugin, width: *mut u32, height: *mut u32) -> bool {
        if width.is_null() || height.is_null() { return false; }
        *width = (*width).max(560);
        *height = (*height).max(500);
        true
    }
    unsafe extern "C" fn web_set_size(plugin: *const clap_plugin, width: u32, height: u32) -> bool {
        if plugin.is_null() || width < 560 || height < 500 { return false; }
        let wrapper = &*((*plugin).plugin_data as *const Self);
        wrapper.web_gui_size.store((width, height));
        true
    }
    unsafe extern "C" fn web_parent(_plugin: *const clap_plugin, window: *const clap_window) -> bool {
        !window.is_null() && Self::web_api(_plugin, (*window).api, false)
    }
    unsafe extern "C" fn web_show(plugin: *const clap_plugin) -> bool {
        let wrapper = &*((*plugin).plugin_data as *const Self);
        wrapper.plugin.lock().webview_open(true);
        true
    }
    unsafe extern "C" fn web_hide(plugin: *const clap_plugin) -> bool {
        let wrapper = &*((*plugin).plugin_data as *const Self);
        wrapper.plugin.lock().webview_open(false);
        true
    }
}
