# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

    Added -- for new features.
    Changed -- for changes in existing functionality.
    Deprecated -- for soon-to-be removed features.
    Removed -- for now removed features.
    Fixed -- for any bug fixes.
    Security -- in case of vulnerabilities.
    Highlights -- Feature which needs to highlighted for the release.
-->

## [0.2.4]

## [0.2.3]

### Fixed
- Prevent creating TriggerFlow sessions until a valid system configuration is available.

### Added
- Template model selection modal for multi-channel templates.

## [0.2.2]

### Fixed
- Ensure maximum model limit is not exceeded when using two-model templates

### Added
- Status banner to show information, warnings and errors that do not belong to a specific model.

## [0.2.1]

### Fixed
- Recall TriggerFlow sessions with empty models.
- Correctly print special characters in the generated script.
- Multiple issues have been corrected for delay time and number of delays parameter.
- Improve rendering performance for trigger models with many event-dependent blocks
- Minor fixes to appearance and UI element alignment
- Incorrect mandatory indicator for List field in constant delay block

### Added
- Keyboard navigation has been added to the Trigger Model modal pane.
- Maximum limit of 10k for number of delay parameter.
- Display maximum models allowed based on system configuration.
- Display trigger model name and slot information for selected block.

### Removed
- Removed Apply and Cancel buttons from delay list popup.

## [0.2.0]

### Highlights
- **TriggerFlow®** - (Stabilized) Visual trigger flow builder for creating complex instrument trigger sequences without manual scripting

### Fixed
- Many bug fixes and improvements to functionality and appearance.

## [0.1.0]

### Highlights
- **\[Beta] Trigger Flow** - Visual trigger flow builder for creating complex instrument trigger sequences without manual scripting
