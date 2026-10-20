use nih_plug::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const FORMAT: &str = "polarity-sc-dark-preset";
type ParameterMap = [(String, ParamPtr, String)];

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Preset {
    pub format: String,
    pub version: u32,
    pub name: String,
    pub parameters: BTreeMap<String, f32>,
}

impl Preset {
    pub fn capture(name: &str, map: &ParameterMap) -> Self {
        Self { format: FORMAT.into(), version: 1, name: name.trim().into(), parameters: map.iter()
            .map(|(id, param, _)| (id.clone(), unsafe { param.unmodulated_normalized_value() })).collect() }
    }
    pub fn validate(&self, map: &ParameterMap) -> Result<(), &'static str> {
        if self.format != FORMAT || self.version != 1 { return Err("Unsupported preset format or version"); }
        if self.name.trim().is_empty() || self.name.chars().count() > 80 || self.name.chars().any(char::is_control) {
            return Err("Preset name must contain 1–80 characters without control characters");
        }
        if self.parameters.len() != map.len() || map.iter().any(|(id, _, _)| !self.parameters.contains_key(id)) {
            return Err("Preset must contain all parameters for this plugin version");
        }
        if self.parameters.values().any(|value| !value.is_finite() || !(0.0..=1.0).contains(value)) {
            return Err("Preset parameter values must be finite numbers from 0 to 1");
        }
        Ok(())
    }
}

pub fn factory_presets(map: &ParameterMap) -> Result<Vec<Preset>, &'static str> {
    let mut init = Preset::capture("Init", map);
    for (id, param, _) in map { init.parameters.insert(id.clone(), unsafe { param.default_normalized_value() }); }
    let settings: &[(&str, &[(&str, &str)])] = &[
        ("Gentle Glue", &[("downwards_ratio", "2"), ("tresh_global", "-24"), ("attack", "30"),
            ("release", "200"), ("downwards_knee", "9"), ("dry_wet", "70%"), ("output", "-3")]),
        ("Detail Lift", &[("downwards_ratio", "8"), ("upwards_ratio", "3"), ("tresh_global", "-30"),
            ("upwards_threshold_offset", "-6"), ("downwards_threshold_offset", "6"),
            ("attack", "15"), ("release", "120"), ("gain_smoothing", "10%"),
            ("upwards_high_freq_rolloff", "50%"), ("downwards_high_freq_rolloff", "75%"),
            ("dry_wet", "60%"), ("output", "-6")]),
    ];
    let mut presets = vec![init.clone()];
    for (name, overrides) in settings {
        let mut preset = init.clone(); preset.name = (*name).into();
        for (id, text) in *overrides {
            let (_, param, _) = map.iter().find(|(key, _, _)| key == id).ok_or("Unknown factory parameter")?;
            let normalized = unsafe { param.string_to_normalized_value(text) }.ok_or("Invalid factory parameter value")?;
            preset.parameters.insert((*id).into(), normalized);
        }
        preset.validate(map)?; presets.push(preset);
    }
    Ok(presets)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SpectralCompressor;
    #[test]
    fn factory_presets_are_complete_and_reset_every_parameter() {
        let plugin = SpectralCompressor::default(); let map = plugin.params.param_map();
        let presets = factory_presets(&map).unwrap();
        assert_eq!(presets.len(), 3);
        assert_eq!(presets[2].name, "Detail Lift");
        for preset in &presets { preset.validate(&map).unwrap(); assert_eq!(preset.parameters.len(), 47); }
        let ratio = map.iter().find(|(id, _, _)| id == "downwards_ratio").unwrap().1;
        assert!(unsafe { ratio.normalized_value_to_string(presets[2].parameters["downwards_ratio"], true) }.starts_with("8.00"));
    }
    #[test]
    fn malformed_presets_fail_validation() {
        let plugin = SpectralCompressor::default(); let map = plugin.params.param_map();
        let original = Preset::capture("Test", &map);
        for bad in [f32::NAN, f32::INFINITY, -0.1, 1.1] {
            let mut preset = original.clone(); preset.parameters.insert("output".into(), bad); assert!(preset.validate(&map).is_err());
        }
        let mut preset = original.clone(); preset.parameters.remove("output"); assert!(preset.validate(&map).is_err());
        let mut preset = original.clone(); preset.parameters.insert("unknown".into(), 0.5); assert!(preset.validate(&map).is_err());
        let mut preset = original.clone(); preset.version = 2; assert!(preset.validate(&map).is_err());
        let mut preset = original.clone(); preset.name = "\n".into(); assert!(preset.validate(&map).is_err());
        let mut preset = original; preset.name = "x".repeat(81); assert!(preset.validate(&map).is_err());
    }
}
