function cfg = init_medium_microgrid(scenarioName)
%INIT_MEDIUM_MICROGRID Configure the medium microgrid example.
%
%   CFG = INIT_MEDIUM_MICROGRID() creates the default grid-connected
%   scenario and publishes all Simulink From Workspace signals to the base
%   workspace.
%
%   CFG = INIT_MEDIUM_MICROGRID(SCENARIONAME) supports:
%     "grid_connected" - load step, PV irradiance step, bus fault.
%     "islanded"       - same disturbances plus grid breaker opening.

if nargin < 1 || strlength(string(scenarioName)) == 0
    scenarioName = "grid_connected";
end
scenarioName = lower(string(scenarioName));

cfg = struct();

cfg.grid.primary_voltage_rms = 10000;
cfg.grid.frequency_hz = 50;
cfg.grid.primary_source_impedance_ohm = 0.05;

cfg.transformer.turns_ratio = 25;
cfg.transformer.power_rating_va = 500e3;
cfg.transformer.secondary_voltage_rms = 400;

cfg.load.base_active_power_w = 300e3;
cfg.load.base_reactive_power_var = 80e3;
cfg.load.step_active_power_w = 100e3;
cfg.load.step_time_s = 2.0;
cfg.load.shed_voltage_threshold_v = 340;
cfg.load.base_resistance_ohm = cfg.transformer.secondary_voltage_rms^2 / ...
    cfg.load.base_active_power_w;
cfg.load.base_inductance_h = cfg.transformer.secondary_voltage_rms^2 / ...
    (2*pi*cfg.grid.frequency_hz*cfg.load.base_reactive_power_var);
cfg.load.step_resistance_ohm = cfg.transformer.secondary_voltage_rms^2 / ...
    cfg.load.step_active_power_w;

cfg.pv.rated_power_w = 150e3;
cfg.pv.irradiance_initial_pu = 1.0;
cfg.pv.irradiance_low_pu = 0.4;
cfg.pv.irradiance_recovery_pu = 0.8;
cfg.pv.irradiance_drop_time_s = 3.0;
cfg.pv.irradiance_recovery_time_s = 4.8;

cfg.battery.power_rating_w = 100e3;
cfg.battery.energy_capacity_wh = 200e3;
cfg.battery.initial_soc_pu = 0.60;
cfg.battery.minimum_soc_pu = 0.20;
cfg.battery.maximum_soc_pu = 0.95;

cfg.fault.start_time_s = 4.0;
cfg.fault.clear_time_s = 4.15;
cfg.fault.resistance_ohm = 0.08;

cfg.scenario.name = char(scenarioName);
cfg.scenario.stop_time_s = 6.0;
cfg.scenario.sample_time_s = 1e-3;
cfg.scenario.island_start_time_s = inf;

if scenarioName == "islanded"
    cfg.scenario.stop_time_s = 7.0;
    cfg.scenario.island_start_time_s = 5.0;
elseif scenarioName ~= "grid_connected"
    error("Unsupported scenarioName '%s'. Use 'grid_connected' or 'islanded'.", scenarioName);
end

t = (0:cfg.scenario.sample_time_s:cfg.scenario.stop_time_s)';
w = 2*pi*cfg.grid.frequency_hz;

breaker_status = double(t < cfg.scenario.island_start_time_s);
step_load_enable = double(t >= cfg.load.step_time_s);
fault_flag = double(t >= cfg.fault.start_time_s & t <= cfg.fault.clear_time_s);

irradiance = cfg.pv.irradiance_initial_pu * ones(size(t));
irradiance(t >= cfg.pv.irradiance_drop_time_s) = cfg.pv.irradiance_low_pu;
irradiance(t >= cfg.pv.irradiance_recovery_time_s) = cfg.pv.irradiance_recovery_pu;

p_load = cfg.load.base_active_power_w + ...
    cfg.load.step_active_power_w .* step_load_enable;
q_grid = cfg.load.base_reactive_power_var * ones(size(t));
p_pv = cfg.pv.rated_power_w .* irradiance;

target_grid_import = 220e3 .* breaker_status;
p_battery = p_load - p_pv - target_grid_import;
p_battery = min(max(p_battery, -cfg.battery.power_rating_w), cfg.battery.power_rating_w);
p_grid = breaker_status .* max(p_load - p_pv - p_battery, 0);

fault_depth = 0.70 .* fault_flag;
load_transient = 0.04 .* exp(-max(t - cfg.load.step_time_s, 0) / 0.25) .* step_load_enable;
pv_transient = 0.03 .* exp(-max(t - cfg.pv.irradiance_drop_time_s, 0) / 0.35) .* ...
    double(t >= cfg.pv.irradiance_drop_time_s);
island_derate = 0.04 .* double(t >= cfg.scenario.island_start_time_s);

v_bus_rms = cfg.transformer.secondary_voltage_rms .* ...
    (1 - fault_depth - load_transient - pv_transient - island_derate);
v_bus_rms = max(v_bus_rms, 40);

frequency = cfg.grid.frequency_hz ...
    - 0.15 .* load_transient ./ 0.04 ...
    - 0.20 .* pv_transient ./ 0.03 ...
    - 0.45 .* fault_flag ...
    - 0.18 .* double(t >= cfg.scenario.island_start_time_s);
frequency = max(frequency, 49.0);

i_grid_rms = p_grid ./ max(v_bus_rms, 40);

soc = cfg.battery.initial_soc_pu - cumtrapz(t, p_battery) ./ ...
    (cfg.battery.energy_capacity_wh * 3600);
soc = min(max(soc, cfg.battery.minimum_soc_pu), cfg.battery.maximum_soc_pu);
battery_remaining_energy_kwh = soc .* (cfg.battery.energy_capacity_wh / 1000);

segmentBoundaries = [cfg.load.step_time_s, cfg.pv.irradiance_drop_time_s, ...
    cfg.fault.start_time_s, cfg.fault.clear_time_s, cfg.pv.irradiance_recovery_time_s];
if isfinite(cfg.scenario.island_start_time_s)
    segmentBoundaries(end + 1) = cfg.scenario.island_start_time_s; %#ok<AGROW>
end
segmentBoundaries = sort(segmentBoundaries);

segment_reset = zeros(size(t));
segment_start_time = zeros(size(t));
current_segment_start = 0;
boundary_idx = 1;
for idx = 1:numel(t)
    while boundary_idx <= numel(segmentBoundaries) && ...
            t(idx) >= segmentBoundaries(boundary_idx) - 0.5 * cfg.scenario.sample_time_s
        current_segment_start = segmentBoundaries(boundary_idx);
        segment_reset(idx) = 1;
        boundary_idx = boundary_idx + 1;
    end
    segment_start_time(idx) = current_segment_start;
end
segment_elapsed_s = max(t - segment_start_time, cfg.scenario.sample_time_s);

voltage_phase = sin(w*t);
% Use the nominal low-voltage bus magnitude for current references so the
% inverter current does not unrealistically increase just because a fault
% depresses the bus voltage.
nominal_bus_voltage_rms = max(cfg.transformer.secondary_voltage_rms, 1);
pv_current_waveform = -sqrt(2) .* p_pv ./ nominal_bus_voltage_rms .* voltage_phase;
battery_current_waveform = -sqrt(2) .* p_battery ./ nominal_bus_voltage_rms .* voltage_phase;

publishSignal("V_bus_rms_ts", t, v_bus_rms);
publishSignal("I_grid_rms_ts", t, i_grid_rms);
publishSignal("P_grid_ts", t, p_grid);
publishSignal("Q_grid_ts", t, q_grid);
publishSignal("P_pv_ts", t, p_pv);
publishSignal("P_battery_ts", t, p_battery);
publishSignal("SoC_ts", t, soc);
publishSignal("battery_remaining_energy_kwh_ts", t, battery_remaining_energy_kwh);
publishSignal("frequency_ts", t, frequency);
publishSignal("fault_flag_ts", t, fault_flag);
publishSignal("breaker_status_ts", t, breaker_status);
publishSignal("step_load_enable_ts", t, step_load_enable);
publishSignal("segment_reset_ts", t, segment_reset);
publishSignal("segment_elapsed_s_ts", t, segment_elapsed_s);
publishSignal("pv_current_waveform_ts", t, pv_current_waveform);
publishSignal("battery_current_waveform_ts", t, battery_current_waveform);

assignin("base", "cfg", cfg);

end

function publishSignal(name, time, values)
assignin("base", name, timeseries(values, time));
end
