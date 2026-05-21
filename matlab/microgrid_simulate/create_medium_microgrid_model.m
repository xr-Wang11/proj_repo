function modelFile = create_medium_microgrid_model()
%CREATE_MEDIUM_MICROGRID_MODEL Build the medium microgrid Simulink model.

projectDir = fileparts(mfilename("fullpath"));
cd(projectDir);

model = "medium_microgrid_distribution_model";
modelFile = fullfile(projectDir, model + ".slx");

cfg = init_medium_microgrid("grid_connected");

if bdIsLoaded(model)
    close_system(model, 0);
end

if isfile(modelFile)
    delete(modelFile);
end

new_system(model);
load_system(model);

set_param(model, ...
    "StopTime", "cfg.scenario.stop_time_s", ...
    "Solver", "ode23t", ...
    "MaxStep", "1e-3", ...
    "SignalLogging", "on", ...
    "SignalLoggingName", "logsout", ...
    "ReturnWorkspaceOutputs", "on", ...
    "InitFcn", "if ~exist('cfg','var'), init_medium_microgrid; end");

load_system("fl_lib");
load_system("nesl_utility");
load_system("simulink");

% Physical network blocks.
add_block("fl_lib/Electrical/Electrical Sources/AC Voltage Source", model + "/电网电源 10kV 50Hz", ...
    "Position", [70 110 160 160]);
add_block("fl_lib/Electrical/Electrical Sensors/Current Sensor", model + "/电网电流传感器", ...
    "Position", [205 110 275 160]);
add_block("fl_lib/Electrical/Electrical Elements/Switch", model + "/主断路器", ...
    "Position", [325 105 405 165]);
add_block("fl_lib/Electrical/Electrical Elements/Ideal Transformer", model + "/变压器 10kV 400V", ...
    "Position", [470 90 570 180]);
add_block("fl_lib/Electrical/Electrical Elements/Electrical Reference", model + "/电气参考地", ...
    "Position", [90 310 170 360]);
add_block("nesl_utility/Solver Configuration", model + "/求解器配置", ...
    "Position", [310 310 420 360]);

add_block("fl_lib/Electrical/Electrical Elements/Resistor", model + "/基础有功负载 300kW", ...
    "Position", [700 70 790 120]);
add_block("fl_lib/Electrical/Electrical Elements/Inductor", model + "/基础无功负载 80kvar", ...
    "Position", [700 145 790 195]);
add_block("fl_lib/Electrical/Electrical Elements/Switch", model + "/阶跃负载开关", ...
    "Position", [650 235 730 295]);
add_block("fl_lib/Electrical/Electrical Elements/Resistor", model + "/阶跃负载 100kW", ...
    "Position", [780 240 880 290]);
add_block("fl_lib/Electrical/Electrical Elements/Switch", model + "/故障开关", ...
    "Position", [650 335 730 395]);
add_block("fl_lib/Electrical/Electrical Elements/Resistor", model + "/故障电阻", ...
    "Position", [780 340 880 390]);
add_block("fl_lib/Electrical/Electrical Sources/Controlled Current Source", model + "/光伏平均电流源", ...
    "Position", [965 75 1065 135]);
add_block("fl_lib/Electrical/Electrical Sources/Controlled Current Source", model + "/电池平均电流源", ...
    "Position", [965 170 1065 230]);
add_block("fl_lib/Electrical/Electrical Sensors/Voltage Sensor", model + "/母线电压传感器", ...
    "Position", [610 15 690 65]);
add_block("fl_lib/Electrical/Electrical Sensors/Current Sensor", model + "/母线馈线电流传感器", ...
    "Position", [610 95 680 145]);

set_param(model + "/电网电源 10kV 50Hz", ...
    "amp", "cfg.grid.primary_voltage_rms*sqrt(2)", ...
    "frequency", "cfg.grid.frequency_hz");
set_param(model + "/变压器 10kV 400V", "n", "cfg.transformer.turns_ratio");
set_param(model + "/基础有功负载 300kW", "R", "cfg.load.base_resistance_ohm");
set_param(model + "/基础无功负载 80kvar", "L", "cfg.load.base_inductance_h");
set_param(model + "/阶跃负载 100kW", "R", "cfg.load.step_resistance_ohm");
set_param(model + "/故障电阻", "R", "cfg.fault.resistance_ohm");
set_param(model + "/主断路器", "R_closed", "0.01", "G_open", "1e-8", "Threshold", "0.5");
set_param(model + "/阶跃负载开关", "R_closed", "0.01", "G_open", "1e-8", "Threshold", "0.5");
set_param(model + "/故障开关", "R_closed", "0.001", "G_open", "1e-8", "Threshold", "0.5");

% Physical control input blocks.
addFromWorkspace(model, "断路器状态输入", "breaker_status_ts", [115 430 240 460]);
addFromWorkspace(model, "阶跃负载使能输入", "step_load_enable_ts", [115 500 240 530]);
addFromWorkspace(model, "故障标志输入", "fault_flag_ts", [115 570 240 600]);
addFromWorkspace(model, "光伏电流波形输入", "pv_current_waveform_ts", [820 75 930 105]);
addFromWorkspace(model, "电池电流波形输入", "battery_current_waveform_ts", [805 170 930 200]);
addFromWorkspace(model, "分段复位输入", "segment_reset_ts", [805 375 930 405]);
addFromWorkspace(model, "分段时长输入", "segment_elapsed_s_ts", [805 430 930 460]);

add_block("nesl_utility/Simulink-PS Converter", model + "/断路器状态转换", ...
    "Position", [270 425 350 465], "Unit", "1");
add_block("nesl_utility/Simulink-PS Converter", model + "/阶跃负载使能转换", ...
    "Position", [270 495 350 535], "Unit", "1");
add_block("nesl_utility/Simulink-PS Converter", model + "/故障标志转换", ...
    "Position", [270 565 350 605], "Unit", "1");
add_block("nesl_utility/Simulink-PS Converter", model + "/光伏电流转换", ...
    "Position", [1110 80 1190 120], "Unit", "A");
add_block("nesl_utility/Simulink-PS Converter", model + "/电池电流转换", ...
    "Position", [1110 175 1190 215], "Unit", "A");
add_block("nesl_utility/PS-Simulink Converter", model + "/母线电压波形", ...
    "Position", [720 15 820 55], "Unit", "V");
add_block("nesl_utility/PS-Simulink Converter", model + "/电网电流波形", ...
    "Position", [205 30 305 70], "Unit", "A");
add_block("nesl_utility/PS-Simulink Converter", model + "/母线馈线电流波形", ...
    "Position", [720 95 820 135], "Unit", "A");

% Real-time measured power estimation blocks.
add_block("simulink/Math Operations/Product", model + "/电网有功瞬时乘积", ...
    "Position", [855 90 905 120], "Inputs", "**");
add_block("simulink/Discrete/Integer Delay", model + "/电网电流四分之一周波延迟", ...
    "Position", [845 140 935 170]);
add_block("simulink/Math Operations/Product", model + "/电网无功瞬时乘积", ...
    "Position", [965 140 1015 170], "Inputs", "**");
add_block("simulink/Math Operations/Gain", model + "/电网无功符号调整", ...
    "Position", [1040 140 1090 170], "Gain", "-1");
add_block("simulink/Math Operations/Product", model + "/光伏有功瞬时乘积", ...
    "Position", [855 230 905 260], "Inputs", "**");
add_block("simulink/Math Operations/Gain", model + "/光伏有功符号调整", ...
    "Position", [935 230 985 260], "Gain", "1");
add_block("simulink/Math Operations/Product", model + "/电池功率瞬时乘积", ...
    "Position", [855 300 905 330], "Inputs", "**");
add_block("simulink/Math Operations/Gain", model + "/电池功率符号调整", ...
    "Position", [935 300 985 330], "Gain", "1");

add_block("simulink/Discrete/Discrete-Time Integrator", model + "/电网有功分段积分", ...
    "Position", [1110 90 1230 120]);
add_block("simulink/Math Operations/Divide", model + "/电网有功分段平均", ...
    "Position", [1270 90 1325 120]);
add_block("simulink/Discrete/Discrete-Time Integrator", model + "/电网无功分段积分", ...
    "Position", [1110 140 1230 170]);
add_block("simulink/Math Operations/Divide", model + "/电网无功分段平均", ...
    "Position", [1270 140 1325 170]);
add_block("simulink/Discrete/Discrete-Time Integrator", model + "/光伏有功分段积分", ...
    "Position", [1110 230 1230 260]);
add_block("simulink/Math Operations/Divide", model + "/光伏有功分段平均", ...
    "Position", [1270 230 1325 260]);
add_block("simulink/Discrete/Discrete-Time Integrator", model + "/电池功率分段积分", ...
    "Position", [1110 300 1230 330]);
add_block("simulink/Math Operations/Divide", model + "/电池功率分段平均", ...
    "Position", [1270 300 1325 330]);
add_block("simulink/Math Operations/Math Function", model + "/电网电流平方", ...
    "Position", [340 30 405 60], "Operator", "square");
add_block("simulink/Discrete/Discrete-Time Integrator", model + "/电网电流平方分段积分", ...
    "Position", [445 30 565 60]);
add_block("simulink/Math Operations/Divide", model + "/电网电流平方分段平均", ...
    "Position", [605 30 660 60]);
add_block("simulink/Math Operations/Math Function", model + "/电网电流RMS实测", ...
    "Position", [700 30 765 60], "Operator", "sqrt");

quarterCycleSamples = round((0.25 / cfg.grid.frequency_hz) / cfg.scenario.sample_time_s);

set_param(model + "/电网电流四分之一周波延迟", ...
    "DelayLength", num2str(quarterCycleSamples), ...
    "InitialCondition", "0", ...
    "SampleTime", "cfg.scenario.sample_time_s");
setSegmentIntegrator(model + "/电网有功分段积分");
setSegmentIntegrator(model + "/电网无功分段积分");
setSegmentIntegrator(model + "/光伏有功分段积分");
setSegmentIntegrator(model + "/电池功率分段积分");
setSegmentIntegrator(model + "/电网电流平方分段积分");

% Logging and display source blocks.
signals = {
    "母线电压指标",       "V_bus_rms_ts",       [1220 40 1345 70];
    "频率指标",           "frequency_ts",       [1220 85 1345 115];
    "电网有功计划",       "P_grid_ts",          [1220 205 1345 235];
    "电网无功计划",       "Q_grid_ts",          [1220 250 1345 280];
    "光伏有功计划",       "P_pv_ts",            [1220 295 1345 325];
    "电池功率计划",       "P_battery_ts",       [1220 340 1345 370];
    "电池荷电状态",       "SoC_ts",             [1220 420 1345 450];
    "电池剩余电量",       "battery_remaining_energy_kwh_ts", [1220 555 1345 585];
    "故障标志",           "fault_flag_ts",      [1220 465 1345 495];
    "断路器状态",         "breaker_status_ts",  [1220 510 1345 540];
};

for k = 1:size(signals, 1)
    addFromWorkspace(model, signals{k, 1}, signals{k, 2}, signals{k, 3});
end

addMuxAndScope(model, "电压频率汇总", "示波器 电压频率", 2, ...
    [1420 50 1450 120], [1500 45 1630 125]);
addMuxAndScope(model, "功率汇总", "示波器 功率流", 4, ...
    [1420 220 1450 365], [1500 245 1630 335]);
addMuxAndScope(model, "电池保护汇总", "示波器 电池保护", 4, ...
    [1420 430 1450 550], [1500 450 1630 530]);
addMuxAndScope(model, "电池电量汇总", "示波器 电池剩余电量", 1, ...
    [1420 590 1450 620], [1500 575 1630 635]);

% Electrical connections.
phSource = get_param(model + "/电网电源 10kV 50Hz", "PortHandles");
phGridI = get_param(model + "/电网电流传感器", "PortHandles");
phMainBreaker = get_param(model + "/主断路器", "PortHandles");
phTransformer = get_param(model + "/变压器 10kV 400V", "PortHandles");
phRef = get_param(model + "/电气参考地", "PortHandles");
phSolver = get_param(model + "/求解器配置", "PortHandles");
phBaseR = get_param(model + "/基础有功负载 300kW", "PortHandles");
phBaseL = get_param(model + "/基础无功负载 80kvar", "PortHandles");
phStepSw = get_param(model + "/阶跃负载开关", "PortHandles");
phStepR = get_param(model + "/阶跃负载 100kW", "PortHandles");
phFaultSw = get_param(model + "/故障开关", "PortHandles");
phFaultR = get_param(model + "/故障电阻", "PortHandles");
phPV = get_param(model + "/光伏平均电流源", "PortHandles");
phBatt = get_param(model + "/电池平均电流源", "PortHandles");
phVBus = get_param(model + "/母线电压传感器", "PortHandles");
phBusFeedI = get_param(model + "/母线馈线电流传感器", "PortHandles");

add_line(model, phSource.RConn, phGridI.LConn, "autorouting", "on");
add_line(model, phGridI.RConn(2), phMainBreaker.LConn, "autorouting", "on");
add_line(model, phMainBreaker.RConn(2), phTransformer.LConn(1), "autorouting", "on");
add_line(model, phSource.LConn, phTransformer.LConn(2), "autorouting", "on");
add_line(model, phRef.LConn, phSource.LConn, "autorouting", "on");
add_line(model, phRef.LConn, phTransformer.RConn(2), "autorouting", "on");
add_line(model, phSolver.RConn, phSource.LConn, "autorouting", "on");

add_line(model, phTransformer.RConn(1), phBusFeedI.LConn, "autorouting", "on");
busTop = phBusFeedI.RConn(2);
busBottom = phTransformer.RConn(2);

add_line(model, busTop, phBaseR.LConn, "autorouting", "on");
add_line(model, phBaseR.RConn, busBottom, "autorouting", "on");
add_line(model, busTop, phBaseL.LConn, "autorouting", "on");
add_line(model, phBaseL.RConn, busBottom, "autorouting", "on");

add_line(model, busTop, phStepSw.LConn, "autorouting", "on");
add_line(model, phStepSw.RConn(2), phStepR.LConn, "autorouting", "on");
add_line(model, phStepR.RConn, busBottom, "autorouting", "on");

add_line(model, busTop, phFaultSw.LConn, "autorouting", "on");
add_line(model, phFaultSw.RConn(2), phFaultR.LConn, "autorouting", "on");
add_line(model, phFaultR.RConn, busBottom, "autorouting", "on");

add_line(model, busTop, phPV.LConn, "autorouting", "on");
add_line(model, phPV.RConn(2), busBottom, "autorouting", "on");
add_line(model, busTop, phBatt.LConn, "autorouting", "on");
add_line(model, phBatt.RConn(2), busBottom, "autorouting", "on");
add_line(model, phVBus.LConn, busTop, "autorouting", "on");
add_line(model, phVBus.RConn(2), busBottom, "autorouting", "on");

% Control signal connections to physical converters.
connectSignal(model, "断路器状态输入", "断路器状态转换");
connectSignal(model, "阶跃负载使能输入", "阶跃负载使能转换");
connectSignal(model, "故障标志输入", "故障标志转换");
connectSignal(model, "光伏电流波形输入", "光伏电流转换");
connectSignal(model, "电池电流波形输入", "电池电流转换");

phBreakerPS = get_param(model + "/断路器状态转换", "PortHandles");
phStepPS = get_param(model + "/阶跃负载使能转换", "PortHandles");
phFaultPS = get_param(model + "/故障标志转换", "PortHandles");
phPvPS = get_param(model + "/光伏电流转换", "PortHandles");
phBattPS = get_param(model + "/电池电流转换", "PortHandles");
phBusVConv = get_param(model + "/母线电压波形", "PortHandles");
phGridIConv = get_param(model + "/电网电流波形", "PortHandles");
phBusFeedIConv = get_param(model + "/母线馈线电流波形", "PortHandles");

add_line(model, phBreakerPS.RConn, phMainBreaker.RConn(1), "autorouting", "on");
add_line(model, phStepPS.RConn, phStepSw.RConn(1), "autorouting", "on");
add_line(model, phFaultPS.RConn, phFaultSw.RConn(1), "autorouting", "on");
add_line(model, phPvPS.RConn, phPV.RConn(1), "autorouting", "on");
add_line(model, phBattPS.RConn, phBatt.RConn(1), "autorouting", "on");
add_line(model, phVBus.RConn(1), phBusVConv.LConn, "autorouting", "on");
add_line(model, phGridI.RConn(1), phGridIConv.LConn, "autorouting", "on");
add_line(model, phBusFeedI.RConn(1), phBusFeedIConv.LConn, "autorouting", "on");

connectSignal(model, "电网电流波形", "电网电流平方", 1);
connectSignal(model, "电网电流平方", "电网电流平方分段积分", 1);
connectSignal(model, "分段复位输入", "电网电流平方分段积分", 2);
connectSignal(model, "电网电流平方分段积分", "电网电流平方分段平均", 1);
connectSignal(model, "分段时长输入", "电网电流平方分段平均", 2);
connectSignal(model, "电网电流平方分段平均", "电网电流RMS实测", 1);

% Real-time measured power signal processing.
connectSignal(model, "母线电压波形", "电网有功瞬时乘积", 1);
connectSignal(model, "母线馈线电流波形", "电网有功瞬时乘积", 2);
connectSignal(model, "母线馈线电流波形", "电网电流四分之一周波延迟", 1);
connectSignal(model, "母线电压波形", "电网无功瞬时乘积", 1);
connectSignal(model, "电网电流四分之一周波延迟", "电网无功瞬时乘积", 2);
connectSignal(model, "电网无功瞬时乘积", "电网无功符号调整", 1);

connectSignal(model, "母线电压波形", "光伏有功瞬时乘积", 1);
connectSignal(model, "光伏电流波形输入", "光伏有功瞬时乘积", 2);
connectSignal(model, "光伏有功瞬时乘积", "光伏有功符号调整", 1);

connectSignal(model, "母线电压波形", "电池功率瞬时乘积", 1);
connectSignal(model, "电池电流波形输入", "电池功率瞬时乘积", 2);
connectSignal(model, "电池功率瞬时乘积", "电池功率符号调整", 1);

connectSignal(model, "电网有功瞬时乘积", "电网有功分段积分", 1);
connectSignal(model, "分段复位输入", "电网有功分段积分", 2);
connectSignal(model, "电网有功分段积分", "电网有功分段平均", 1);
connectSignal(model, "分段时长输入", "电网有功分段平均", 2);

connectSignal(model, "电网无功符号调整", "电网无功分段积分", 1);
connectSignal(model, "分段复位输入", "电网无功分段积分", 2);
connectSignal(model, "电网无功分段积分", "电网无功分段平均", 1);
connectSignal(model, "分段时长输入", "电网无功分段平均", 2);

connectSignal(model, "光伏有功符号调整", "光伏有功分段积分", 1);
connectSignal(model, "分段复位输入", "光伏有功分段积分", 2);
connectSignal(model, "光伏有功分段积分", "光伏有功分段平均", 1);
connectSignal(model, "分段时长输入", "光伏有功分段平均", 2);

connectSignal(model, "电池功率符号调整", "电池功率分段积分", 1);
connectSignal(model, "分段复位输入", "电池功率分段积分", 2);
connectSignal(model, "电池功率分段积分", "电池功率分段平均", 1);
connectSignal(model, "分段时长输入", "电池功率分段平均", 2);

% Scope and logsout connections.
connectLoggedSignal(model, "母线电压指标", "电压频率汇总", 1, "V_bus_rms");
connectLoggedSignal(model, "频率指标", "电压频率汇总", 2, "frequency");

connectLoggedSignalToTerminator(model, "电网有功计划", "P_grid", [1380 205 1410 225]);
connectLoggedSignalToTerminator(model, "电网无功计划", "Q_grid", [1380 250 1410 270]);
connectLoggedSignalToTerminator(model, "光伏有功计划", "P_pv", [1380 295 1410 315]);
connectLoggedSignalToTerminator(model, "电池功率计划", "P_battery", [1380 340 1410 360]);

connectNamedSignal(model, "电网有功分段平均", "功率汇总", 1, "Grid active power segment average (W)");
connectNamedSignal(model, "电网无功分段平均", "功率汇总", 2, "Grid reactive power segment average (var)");
connectNamedSignal(model, "光伏有功分段平均", "功率汇总", 3, "PV active power segment average (W)");
connectNamedSignal(model, "电池功率分段平均", "功率汇总", 4, "Battery power segment average (W)");

connectLoggedSignal(model, "电池荷电状态", "电池保护汇总", 1, "SoC");
connectLoggedSignal(model, "电网电流RMS实测", "电池保护汇总", 2, "I_grid_rms");
connectLoggedSignal(model, "故障标志", "电池保护汇总", 3, "fault_flag");
connectLoggedSignal(model, "断路器状态", "电池保护汇总", 4, "breaker_status");
connectLoggedSignal(model, "电池剩余电量", "电池电量汇总", 1, "Battery remaining energy (kWh)");

Simulink.BlockDiagram.arrangeSystem(model);
save_system(model, modelFile);
fprintf("Created %s\n", modelFile);

end

function addFromWorkspace(model, blockName, variableName, position)
add_block("simulink/Sources/From Workspace", model + "/" + blockName, ...
    "Position", position, ...
    "VariableName", variableName, ...
    "SampleTime", "cfg.scenario.sample_time_s");
end

function addMuxAndScope(model, muxName, scopeName, inputs, muxPos, scopePos)
add_block("simulink/Signal Routing/Mux", model + "/" + muxName, ...
    "Position", muxPos, "Inputs", string(inputs));
add_block("simulink/Sinks/Scope", model + "/" + scopeName, ...
    "Position", scopePos);
phMux = get_param(model + "/" + muxName, "PortHandles");
phScope = get_param(model + "/" + scopeName, "PortHandles");
add_line(model, phMux.Outport, phScope.Inport, "autorouting", "on");
end

function connectSignal(model, sourceName, destName, destPort)
if nargin < 4
    destPort = 1;
end
phSource = get_param(model + "/" + sourceName, "PortHandles");
phDest = get_param(model + "/" + destName, "PortHandles");
add_line(model, phSource.Outport, phDest.Inport(destPort), "autorouting", "on");
end

function connectLoggedSignal(model, sourceName, muxName, muxPort, signalName)
phSource = get_param(model + "/" + sourceName, "PortHandles");
phMux = get_param(model + "/" + muxName, "PortHandles");
lineHandle = add_line(model, phSource.Outport, phMux.Inport(muxPort), "autorouting", "on");
set_param(lineHandle, "Name", signalName);
Simulink.sdi.markSignalForStreaming(lineHandle, "on");
end

function connectLoggedSignalToTerminator(model, sourceName, signalName, terminatorPosition)
terminatorName = sourceName + "_log_terminator";
add_block("simulink/Sinks/Terminator", model + "/" + terminatorName, ...
    "Position", terminatorPosition);
phSource = get_param(model + "/" + sourceName, "PortHandles");
phTerminator = get_param(model + "/" + terminatorName, "PortHandles");
lineHandle = add_line(model, phSource.Outport, phTerminator.Inport, "autorouting", "on");
set_param(lineHandle, "Name", signalName);
Simulink.sdi.markSignalForStreaming(lineHandle, "on");
end

function connectNamedSignal(model, sourceName, muxName, muxPort, signalName)
phSource = get_param(model + "/" + sourceName, "PortHandles");
phMux = get_param(model + "/" + muxName, "PortHandles");
lineHandle = add_line(model, phSource.Outport, phMux.Inport(muxPort), "autorouting", "on");
set_param(lineHandle, "Name", signalName);
Simulink.sdi.markSignalForStreaming(lineHandle, "on");
end

function setSegmentIntegrator(blockPath)
set_param(blockPath, ...
    "IntegratorMethod", "Forward Euler", ...
    "gainval", "1", ...
    "ExternalReset", "rising", ...
    "InitialCondition", "0", ...
    "SampleTime", "cfg.scenario.sample_time_s");
end
