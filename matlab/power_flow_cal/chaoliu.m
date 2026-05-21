clear;
clc;

converge = false;
k_max = 100;
epsilon = 10e-6;
Bus_name = ['BUS1' ; 'BUS2' ;'BUS3';'BUS4';'BUS5'];
Bus_Pg = [0;0;0;0;0.2];
Bus_Qg = [0;0;0;0;0];
Bus_Pl = [0;0.16;0;0.55;0];
Bus_Ql = [0;0.1;0;0.25;0];
Bus_Votage = [1.05;1;1;1;1.05];
Bus_Theta = [0;0;0;0;0];%只有BUS1真实值为0，其余皆为占位
Bus_Data = struct('name',Bus_name,'pg',Bus_Pg,'qg',Bus_Qg,'pl',Bus_Pl,'ql',Bus_Ql,'u',Bus_Votage,'theta',Bus_Theta);
Bus_count = 5;
balance_idx = 1;
PV_idx = 5;
PQ_idx = [2,3,4];
theta_unk_idx = [PV_idx,PQ_idx];
votage_unk_idx = PQ_idx;
n_theta = length(theta_unk_idx);
n_votage = length(votage_unk_idx);

line_data = [
    1, 2, 0.02, 0.10;
    2, 3, 0.02, 0.10;
    2, 4, 0.02, 0.10;
    3, 4, 0.02, 0.10;
    3, 5, 0.02, 0.10;
];

Daona_mat = zeros(Bus_count, Bus_count);

for k = 1:size(line_data, 1)
    i = line_data(k, 1);
    j = line_data(k, 2);
    R = line_data(k, 3);
    X = line_data(k, 4);
    
    y = 1 / (R + 1j*X);
    
    Daona_mat(i,i) = Daona_mat(i,i) + y;
    Daona_mat(j,j) = Daona_mat(j,j) + y;
    Daona_mat(i,j) = Daona_mat(i,j) - y;
    Daona_mat(j,i) = Daona_mat(j,i) - y;
end


B = imag(Daona_mat);
G = real(Daona_mat);

H = zeros(Bus_count);
N = zeros(Bus_count);
M = zeros(Bus_count);
L = zeros(Bus_count);
theta = zeros(Bus_count);

k = 0;

max_mismatch_history = [];
V_history = [];

while ~converge && k < k_max
    k = k + 1;
    P_calc = zeros(Bus_count, 1);
    Q_calc = zeros(Bus_count, 1);
    H = zeros(Bus_count);
    N = zeros(Bus_count);
    M = zeros(Bus_count);
    L = zeros(Bus_count);

    for i = 1:Bus_count
        for j = 1:Bus_count
            theta_ij = Bus_Data.theta(i) - Bus_Data.theta(j);
            P_calc(i) = P_calc(i) + Bus_Data.u(i)*Bus_Data.u(j)*(G(i,j)*cos(theta_ij) + B(i,j)*sin(theta_ij));
            Q_calc(i) = Q_calc(i) + Bus_Data.u(i)*Bus_Data.u(j)*(G(i,j)*sin(theta_ij) - B(i,j)*cos(theta_ij));
        end
    end

    P_given = Bus_Data.pg - Bus_Data.pl;
    Q_given = Bus_Data.qg - Bus_Data.ql;
    delta_P = P_given - P_calc;
    delta_Q = Q_given - Q_calc;

    max_mismatch = max(abs([delta_P(theta_unk_idx); delta_Q(votage_unk_idx)]));
    max_mismatch_history = [max_mismatch_history, max_mismatch]; %#ok<AGROW>
    V_history = [V_history, Bus_Data.u]; %#ok<AGROW>

    if max_mismatch <= epsilon
        converge = true;
        break;
    end

    for i = 1:Bus_count
        for j = 1:Bus_count
            if i ~= j
                theta(i,j) = Bus_Data.theta(i) - Bus_Data.theta(j);
                H(i,j) = Bus_Data.u(j)*Bus_Data.u(i) * (G(i,j)*sin(theta(i,j))-B(i,j)*cos(theta(i,j)));
                N(i,j) = Bus_Data.u(j)*Bus_Data.u(i) * (G(i,j)*cos(theta(i,j))+B(i,j)*sin(theta(i,j)));
                M(i,j) = -Bus_Data.u(j)*Bus_Data.u(i) * (G(i,j)*cos(theta(i,j))+B(i,j)*sin(theta(i,j)));
                L(i,j) = Bus_Data.u(j)*Bus_Data.u(i) * (G(i,j)*sin(theta(i,j))-B(i,j)*cos(theta(i,j)));
            else
                H(i,i) = -Q_calc(i) - Bus_Data.u(i)^2 * B(i,i);
                N(i,i) =  P_calc(i) + Bus_Data.u(i)^2 * G(i,i);
                M(i,i) =  P_calc(i) - Bus_Data.u(i)^2 * G(i,i);
                L(i,i) =  Q_calc(i) - Bus_Data.u(i)^2 * B(i,i);
            end
        end
    end

    H_sub = H(theta_unk_idx, theta_unk_idx);
    N_sub = N(theta_unk_idx, votage_unk_idx);
    M_sub = M(votage_unk_idx, theta_unk_idx);
    L_sub = L(votage_unk_idx, votage_unk_idx);
    Jacob = [H_sub, N_sub;
         M_sub, L_sub];
    dP_unknown = delta_P(theta_unk_idx);
    dQ_unknown = delta_Q(votage_unk_idx);
    dx = [dP_unknown; dQ_unknown];

    delta = Jacob \ dx;
    delta_theta = delta(1:n_theta);
    delta_U_over_U = delta(n_theta+1:end);

    Bus_Data.theta(theta_unk_idx) = Bus_Data.theta(theta_unk_idx) + delta_theta;
    Bus_Data.u(votage_unk_idx) = Bus_Data.u(votage_unk_idx) + delta_U_over_U .* Bus_Data.u(votage_unk_idx);
end

picDir = fullfile(fileparts(mfilename('fullpath')), 'pic');
if ~exist(picDir, 'dir')
    mkdir(picDir);
end

busLabels = strtrim(cellstr(Bus_Data.name));

figure('Color','w', 'Position', [100 100 1100 620]);
mismatch_lg = log10(max(max_mismatch_history, realmin));
plot(1:k, mismatch_lg, '-o', ...
    'LineWidth', 2.2, ...
    'MarkerSize', 6, ...
    'Color', [0.05 0.32 0.75]);
grid on;
xticks(1:k);
xlim([1 k]);
xlabel('迭代次数');
ylabel('lg(最大不平衡量 / pu)');
title('潮流迭代收敛曲线');
set(gca, 'FontSize', 12);
saveas(gcf, fullfile(picDir, 'chaoliu_convergence.png'));

figure('Color','w', 'Position', [100 100 1100 620]);
bar(Bus_Data.u, 'FaceColor', [0.10 0.55 0.45], 'EdgeColor', 'none');
hold on;
yline(1.05, '--', '1.05 pu', 'Color', [0.40 0.40 0.40], 'LineWidth', 1.2, 'LabelHorizontalAlignment', 'left');
yline(0.95, '--', '0.95 pu', 'Color', [0.40 0.40 0.40], 'LineWidth', 1.2, 'LabelHorizontalAlignment', 'left');
grid on;
xticks(1:Bus_count);
xticklabels(busLabels);
ylabel('电压幅值 (pu)');
title('各母线电压幅值');
ylim([0.94 1.07]);
set(gca, 'FontSize', 12);
for i = 1:Bus_count
    text(i, Bus_Data.u(i) + 0.004, sprintf('%.4f', Bus_Data.u(i)), ...
        'HorizontalAlignment', 'center', ...
        'FontSize', 11, ...
        'FontWeight', 'bold');
end
saveas(gcf, fullfile(picDir, 'chaoliu_bus_voltage.png'));

figure('Color','w', 'Position', [100 100 1100 620]);
plot(1:Bus_count, rad2deg(Bus_Data.theta), '-s', ...
    'LineWidth', 2.4, ...
    'MarkerSize', 8, ...
    'Color', [0.88 0.28 0.05], ...
    'MarkerFaceColor', [0.88 0.28 0.05]);
grid on;
xticks(1:Bus_count);
xticklabels(busLabels);
ylabel('相角 (deg)');
title('各母线电压相角');
set(gca, 'FontSize', 12);
for i = 1:Bus_count
    text(i, rad2deg(Bus_Data.theta(i)) - 0.18, sprintf('%.2f°', rad2deg(Bus_Data.theta(i))), ...
        'HorizontalAlignment', 'center', ...
        'FontSize', 11, ...
        'FontWeight', 'bold');
end
saveas(gcf, fullfile(picDir, 'chaoliu_bus_angle.png'));

busXY = [
    0.0, 3.0;
    2.2, 3.0;
    4.4, 3.0;
    5.2, 0.55;
    6.8, 3.0;
];

wireRoutes = {
    [0.0, 3.0; 2.2, 3.0];
    [2.2, 3.0; 4.4, 3.0];
    [2.2, 3.0; 2.2, 0.25; 5.2, 0.25; 5.2, 0.55];
    [4.4, 3.0; 4.4, 0.85; 5.2, 0.85; 5.2, 0.55];
    [4.4, 3.0; 6.8, 3.0];
};
impedanceBoxXY = [
    1.10, 3.00;
    3.30, 3.00;
    2.20, 1.65;
    4.40, 1.95;
    5.60, 3.00;
];
impedanceLabelXY = [
    1.10, 3.28;
    3.30, 3.28;
    2.55, 1.93;
    4.75, 2.23;
    5.60, 3.28;
];

figure('Color','w', 'Position', [100 100 1450 850]);
hold on;
axis equal;
axis off;
title('潮流程序使用的五母线等效电路图', 'FontSize', 17, 'FontWeight', 'bold');

for idx = 1:numel(wireRoutes)
    route = wireRoutes{idx};
    for seg = 1:size(route, 1)-1
        plot(route(seg:seg+1, 1), route(seg:seg+1, 2), ...
            'Color', 'k', ...
            'LineWidth', 1.15);
    end
end

boxWidth = 0.72;
boxHeight = 0.26;
for idx = 1:size(line_data, 1)
    center = impedanceBoxXY(idx, :);
    rectangle('Position', [center(1)-boxWidth/2, center(2)-boxHeight/2, boxWidth, boxHeight], ...
        'FaceColor', 'w', ...
        'EdgeColor', 'k', ...
        'LineWidth', 1.25);
    if idx == 3 || idx == 4
        labelAlign = 'left';
    else
        labelAlign = 'center';
    end
    text(impedanceLabelXY(idx, 1), impedanceLabelXY(idx, 2), ...
        sprintf('Z%d%d  R=%.2f, X=%.2f pu', line_data(idx, 1), line_data(idx, 2), line_data(idx, 3), line_data(idx, 4)), ...
        'HorizontalAlignment', labelAlign, ...
        'VerticalAlignment', 'bottom', ...
        'FontSize', 10.5, ...
        'BackgroundColor', 'w', ...
        'Interpreter', 'none', ...
        'Margin', 2);
end

for i = 1:Bus_count
    x = busXY(i, 1);
    y = busXY(i, 2);

    if i == balance_idx
        nodeType = '平衡';
        nodeDetail = sprintf('U=%.2f∠0.00° pu', Bus_Votage(i));
    elseif ismember(i, PV_idx)
        nodeType = 'PV';
        nodeDetail = sprintf('Pg=%.2f pu', Bus_Data.pg(i));
    else
        nodeType = 'PQ';
        nodeDetail = sprintf('S=%.2f+j%.2f pu', Bus_Data.pl(i), Bus_Data.ql(i));
    end

    plot(x, y, 'o', ...
        'MarkerSize', 30, ...
        'MarkerFaceColor', 'w', ...
        'MarkerEdgeColor', 'k', ...
        'LineWidth', 1.5);
    text(x, y, nodeType, ...
        'HorizontalAlignment', 'center', ...
        'VerticalAlignment', 'middle', ...
        'FontSize', 9.5, ...
        'FontWeight', 'bold', ...
        'Interpreter', 'none');
    text(x, y + 0.43, ...
        sprintf('%s\nV=%.2f pu, θ=%.2f°\n%s', busLabels{i}, Bus_Data.u(i), rad2deg(Bus_Data.theta(i)), nodeDetail), ...
        'HorizontalAlignment', 'center', ...
        'VerticalAlignment', 'bottom', ...
        'FontSize', 10.5, ...
        'FontWeight', 'bold', ...
        'BackgroundColor', 'w', ...
        'Interpreter', 'none', ...
        'Margin', 3);
end

text(0.0, -0.10, '空心圆: 母线节点    矩形: 线路阻抗    黑色细线: 按 line_data 连接的等效线路', ...
    'HorizontalAlignment', 'left', ...
    'FontSize', 11.5, ...
    'FontWeight', 'bold', ...
    'Interpreter', 'none');
xlim([-0.75 7.35]);
ylim([-0.25 4.65]);
saveas(gcf, fullfile(picDir, 'chaoliu_equivalent_circuit.png'));

fprintf('潮流计算收敛状态: %d\n', converge);
fprintf('迭代次数: %d\n', k);
fprintf('最终最大不平衡量: %.8g pu\n\n', max_mismatch_history(end));
fprintf('母线电压结果:\n');
fprintf('%-6s %-12s %-12s\n', 'Bus', 'V(pu)', 'Theta(deg)');
for i = 1:Bus_count
    fprintf('%-6s %-12.6f %-12.6f\n', strtrim(Bus_Data.name(i,:)), Bus_Data.u(i), rad2deg(Bus_Data.theta(i)));
end
fprintf('\n可视化图片已保存到: %s\n', picDir);
