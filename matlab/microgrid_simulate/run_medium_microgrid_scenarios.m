function results = run_medium_microgrid_scenarios(scenarios)
%RUN_MEDIUM_MICROGRID_SCENARIOS Simulate and validate microgrid scenarios.

projectDir = fileparts(mfilename("fullpath"));
cd(projectDir);

model = "medium_microgrid_distribution_model";
modelFile = fullfile(projectDir, model + ".slx");

if nargin < 1 || isempty(scenarios)
    scenarios = ["grid_connected", "islanded"];
end
scenarios = string(scenarios);

if ~isfile(modelFile)
    create_medium_microgrid_model();
end

if ~bdIsLoaded(model)
    load_system(model);
end

results = struct();

for k = 1:numel(scenarios)
    scenarioName = scenarios(k);
    cfg = init_medium_microgrid(scenarioName);
    simOut = sim(model, "StopTime", num2str(cfg.scenario.stop_time_s));
    logsout = simOut.logsout;

    vBus = getLoggedSignal(logsout, "V_bus_rms");
    freq = getLoggedSignal(logsout, "frequency");
    pGrid = getLoggedSignal(logsout, "P_grid");
    pPv = getLoggedSignal(logsout, "P_pv");
    pBattery = getLoggedSignal(logsout, "P_battery");
    soc = getLoggedSignal(logsout, "SoC");
    fault = getLoggedSignal(logsout, "fault_flag");
    breaker = getLoggedSignal(logsout, "breaker_status");

    t = vBus.Time;
    v = squeeze(vBus.Data);
    f = squeeze(freq.Data);

    steadyMask = t >= 1.0 & t < cfg.load.step_time_s;
    postLoadMask = t >= cfg.load.step_time_s & t < cfg.pv.irradiance_drop_time_s;
    faultMask = t >= cfg.fault.start_time_s & t <= cfg.fault.clear_time_s;
    recoveryMask = t > cfg.fault.clear_time_s + 0.5;

    metrics = struct();
    metrics.min_steady_voltage_v = min(v(steadyMask));
    metrics.max_steady_voltage_v = max(v(steadyMask));
    metrics.min_post_load_voltage_v = min(v(postLoadMask));
    metrics.min_fault_voltage_v = min(v(faultMask));
    metrics.min_recovery_voltage_v = min(v(recoveryMask));
    metrics.min_frequency_hz = min(f);
    metrics.final_soc_pu = soc.Data(end);
    metrics.final_breaker_status = breaker.Data(end);
    metrics.max_grid_power_w = max(pGrid.Data);
    metrics.max_pv_power_w = max(pPv.Data);
    metrics.max_battery_discharge_w = max(pBattery.Data);
    metrics.fault_samples = nnz(fault.Data > 0.5);

    pass = struct();
    pass.steady_voltage = metrics.min_steady_voltage_v >= 380 && metrics.max_steady_voltage_v <= 420;
    pass.load_step_voltage = metrics.min_post_load_voltage_v >= 360;
    pass.frequency = metrics.min_frequency_hz >= 49.0;
    pass.fault_recorded = metrics.fault_samples > 0 && metrics.min_fault_voltage_v < 200;
    pass.recovery = metrics.min_recovery_voltage_v >= 360;

    results.(matlab.lang.makeValidName(scenarioName)).cfg = cfg;
    results.(matlab.lang.makeValidName(scenarioName)).simOut = simOut;
    results.(matlab.lang.makeValidName(scenarioName)).metrics = metrics;
    results.(matlab.lang.makeValidName(scenarioName)).pass = pass;

    fprintf("\nScenario: %s\n", scenarioName);
    fprintf("  Steady V range: %.1f to %.1f V\n", metrics.min_steady_voltage_v, metrics.max_steady_voltage_v);
    fprintf("  Min post-load V: %.1f V\n", metrics.min_post_load_voltage_v);
    fprintf("  Min fault V: %.1f V\n", metrics.min_fault_voltage_v);
    fprintf("  Min recovery V: %.1f V\n", metrics.min_recovery_voltage_v);
    fprintf("  Min frequency: %.2f Hz\n", metrics.min_frequency_hz);
    fprintf("  Final SoC: %.3f pu\n", metrics.final_soc_pu);
    fprintf("  Pass: steady=%d load=%d frequency=%d fault=%d recovery=%d\n", ...
        pass.steady_voltage, pass.load_step_voltage, pass.frequency, ...
        pass.fault_recorded, pass.recovery);
end

assignin("base", "medium_microgrid_results", results);

end

function signal = getLoggedSignal(logsout, name)
aliases = getSignalAliases(string(name));

for idx = 1:logsout.numElements
    element = logsout.getElement(idx);
    if any(string(element.Name) == aliases)
        signal = element.Values;
        return;
    end
end

availableNames = strings(logsout.numElements, 1);
for idx = 1:logsout.numElements
    availableNames(idx) = string(logsout.getElement(idx).Name);
end

error("Could not find logged signal '%s'. Available signals: %s", ...
    name, strjoin(availableNames, ", "));
end

function aliases = getSignalAliases(name)
switch name
    case "V_bus_rms"
        aliases = ["V_bus_rms", "Bus voltage RMS (V)"];
    case "frequency"
        aliases = ["frequency", "Frequency (Hz)"];
    case "I_grid_rms"
        aliases = ["I_grid_rms", "Grid current RMS (A)"];
    case "P_grid"
        aliases = ["P_grid", "Grid active power (W)"];
    case "Q_grid"
        aliases = ["Q_grid", "Grid reactive power (var)"];
    case "P_pv"
        aliases = ["P_pv", "PV active power (W)"];
    case "P_battery"
        aliases = ["P_battery", "Battery power (W)"];
    case "SoC"
        aliases = ["SoC", "Battery SoC (pu)"];
    case "fault_flag"
        aliases = ["fault_flag", "Fault flag"];
    case "breaker_status"
        aliases = ["breaker_status", "Breaker status"];
    otherwise
        aliases = name;
end
end
