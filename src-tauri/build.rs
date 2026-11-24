fn main() {
  // Generates the allow-* permissions the site browser's capability grants.
  let site_browser = tauri_build::InlinedPlugin::new().commands(&["status", "targets", "send", "blocklist_add", "shop_list", "shop_add"]);
  tauri_build::try_build(tauri_build::Attributes::new().plugin("site-browser", site_browser))
    .expect("failed to run tauri-build");
}
