module.exports.IG_CAPABILITIES ='3boDAA==';
module.exports.IG_VERSION = '10.33.0';
module.exports.VERSION_CODE = '67410771';
module.exports.API_URL = 'https://www.instagram.com'
module.exports.SIG_KEY_VERSION = '4';
module.exports.IG_SIG_KEY = '4f8732eb9ba7d1c8e8897a75d6474d4eb3f5279137431b2aafb71fafe2abe178';
module.exports.USER_AGENT_LOCALE = 'en_US'
module.exports.EXPERIMENTS_REFRESH = 7200;
module.exports.SURFACE_PARAM = 4715;
module.exports.LOGIN_EXPERIMENTS = 'ig_android_flexible_sampling_universe,ig_android_me_profile_prefill_in_reg,ig_android_allow_phone_reg_selectable,ig_android_analytics_data_loss,ig_android_set_contact_triage_tab_to_available_prefill,ig_android_gmail_oauth_in_reg,ig_android_focus_fullname_registration,ig_android_universal_instagram_deep_links_universe,ig_android_make_sure_next_button_is_visible_in_reg,ig_android_phone_id_phone_prefill_in_reg,ig_fbns_push,ig_profile_account_dropdown_universe,ig_android_background_phone_confirmation_v2,ig_android_reg_omnibox,ig_android_skip_signup_from_one_tap_if_no_fb_sso,ig_android_remove_icons_in_reg,ig_periodic_username_check_in_reg,ig_android_use_in_app_browser_for_deep_links_universe,ig_android_password_toggle_on_login_universe,ig_android_run_device_verification,ig_android_remove_sms_password_reset_deep_link,ig_android_async_probe,ig_android_fb_family_navigation_badging,ig_restore_focus_on_reg_textbox_universe,ig_android_abandoned_reg_flow,ig_android_phoneid_sync_interval,ig_android_2fac_auto_fill_sms_universe,ig_android_family_apps_user_values_provider_universe,ig_android_run_fb_reauth_on_background,ig_android_country_code_fix_excluding_hsite_in_reg,ig_android_login_autocomplete_autologin_universe,ig_android_show_password_in_reg_universe,ig_fbns_blocked,ig_android_access_redesign,ig_android_ui_cleanup_in_reg';
module.exports.PERSISTENT_KEYS = [
  'account_id', // The numerical UserPK ID of the account.
  'devicestring', // Which Android device they're identifying as.
  'device_id', // Hardware identifier.
  'phone_id', // Hardware identifier.
  'uuid', // Universally unique identifier.
  'advertising_id', // Google Play advertising ID.
  'session_id', // The user's current application session ID.
  'experiments', // Interesting experiment variables for this account.
  'fbns_auth', // Serialized auth credentials for FBNS.
  'last_login', // Tracks time elapsed since our last login state refresh.
  'last_experiments', // Tracks time elapsed since our last experiments refresh.
];
module.exports.DEVICES = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13) AppleWebKit/603.1.13 (KHTML, like Gecko) Version/10.1 Safari/603.1.13',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11) AppleWebKit/601.1.39 (KHTML, like Gecko) Version/9.0 Safari/601.1.39',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/600.3.10 (KHTML, like Gecko) Version/8.0.3 Safari/600.3.10',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.75.14 (KHTML, like Gecko) Version/6.1.3 Safari/537.75.14',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_2) AppleWebKit/536.26.17 (KHTML, like Gecko) Version/6.0.2 Safari/536.26.17',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/534.55.3 (KHTML, like Gecko) Version/5.1.3 Safari/534.53.10'
];
module.exports.LOGIN_QUERY = `
viewer() {
  eligible_promotions.surface_nux_id(<surface>).external_gating_permitted_qps(<external_gating_permitted_qps>) {
    edges {
      priority,
      time_range {
        start,
        end
      },
      node {
        id,
        promotion_id,
        max_impressions,
        triggers,
        template {
          name,
          parameters {
            name,
            string_value
          }
        },
        creatives {
          title {
            text
          },
          content {
            text
          },
          footer {
            text
          },
          social_context {
            text
          },
          primary_action{
            title {
              text
            },
            url,
            limit,
            dismiss_promotion
          },
          secondary_action{
            title {
              text
            },
            url,
            limit,
            dismiss_promotion
          },
          dismiss_action{
            title {
              text
            },
            url,
            limit,
            dismiss_promotion
          },
          image {
            uri
          }
        }
      }
    }
  }
}`