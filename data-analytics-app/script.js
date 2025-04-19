let currentData = null;
let currentChart = null;
let realTimeSyncInterval = null;
let currentTheme = 'light';

// Theme Management
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
}

// Initialize theme from localStorage
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    currentTheme = savedTheme;
    document.documentElement.setAttribute('data-theme', currentTheme);
});

// Data Import Functions
function handleCSVUpload() {
    const fileInput = document.getElementById('csvInput');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a CSV file');
        return;
    }

    Papa.parse(file, {
        complete: function(results) {
            processData(results.data);
        },
        header: true,
        skipEmptyLines: true,
        error: function(error) {
            alert('Error parsing CSV: ' + error);
        }
    });
}

function handleExcelUpload() {
    const fileInput = document.getElementById('excelInput');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select an Excel file');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        processData(jsonData);
    };
    reader.readAsArrayBuffer(file);
}

function handleJSONUpload() {
    const fileInput = document.getElementById('jsonInput');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a JSON file');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const jsonData = JSON.parse(e.target.result);
            processData(jsonData);
        } catch (error) {
            alert('Error parsing JSON: ' + error);
        }
    };
    reader.readAsText(file);
}

function processData(data) {
    if (!Array.isArray(data) || data.length === 0) {
        alert('Invalid data format');
        return;
    }

    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(header => row[header]));

    currentData = {
        headers: headers,
        rows: rows,
        filteredRows: rows // Initialize filtered rows with all rows
    };

    setupChartControls(headers);
    setupFilterControls(headers);
    document.getElementById('chart-container').classList.remove('hidden');
    document.getElementById('suggestions').classList.remove('hidden');

    updateChart();
    generateSuggestions();
    setupRealTimeSync();
}

function setupChartControls(headers) {
    const dataColumn = document.getElementById('dataColumn');
    dataColumn.innerHTML = '<option value="">Select Data Column</option>';
    
    headers.forEach((header, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = header;
        dataColumn.appendChild(option);
    });

    if (headers.length > 0) {
        dataColumn.value = '0';
    }
}

function setupFilterControls(headers) {
    const filterColumn = document.getElementById('filterColumn');
    filterColumn.innerHTML = '<option value="">Select Column</option>';
    
    headers.forEach((header, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = header;
        filterColumn.appendChild(option);
    });
}

function updateChart() {
    const chartType = document.getElementById('chartType').value;
    const columnIndex = document.getElementById('dataColumn').value;
    const aggregationType = document.getElementById('aggregationType').value;

    if (!currentData || columnIndex === '') return;

    const ctx = document.getElementById('dataChart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }

    // Use filtered rows if available, otherwise use all rows
    const rows = currentData.filteredRows || currentData.rows;
    const columnData = rows.map(row => row[columnIndex]);
    const columnName = currentData.headers[columnIndex];
    const isNumeric = columnData.every(value => !isNaN(parseFloat(value)));

    let chartData = prepareChartData(chartType, columnData, columnName, isNumeric, aggregationType);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: document.getElementById('chartTitle').value || `${columnName} - ${getChartTitle(chartType, isNumeric, aggregationType)}`
            },
            legend: {
                display: document.getElementById('showLegend').checked,
                position: document.getElementById('legendPosition').value
            }
        },
        scales: {
            y: {
                beginAtZero: document.getElementById('beginAtZero').checked,
                grid: {
                    display: document.getElementById('showGrid').checked
                }
            },
            x: {
                grid: {
                    display: document.getElementById('showGrid').checked
                }
            }
        }
    };

    currentChart = new Chart(ctx, {
        type: chartType,
        data: chartData,
        options: options
    });
}

function prepareChartData(chartType, columnData, columnName, isNumeric, aggregationType) {
    if (chartType === 'pie') {
        return preparePieChartData(columnData);
    } else if (chartType === 'heatmap') {
        return prepareHeatmapData(columnData);
    } else {
        return prepareBarLineScatterData(columnData, columnName, isNumeric, aggregationType);
    }
}

function preparePieChartData(columnData) {
    const valueCounts = {};
    columnData.forEach(value => {
        valueCounts[value] = (valueCounts[value] || 0) + 1;
    });

    return {
        labels: Object.keys(valueCounts),
        datasets: [{
            data: Object.values(valueCounts),
            backgroundColor: generateColors(Object.keys(valueCounts).length)
        }]
    };
}

function prepareHeatmapData(columnData) {
    // Implementation for heatmap visualization
    const uniqueValues = [...new Set(columnData)];
    const valueToIndex = {};
    uniqueValues.forEach((value, index) => {
        valueToIndex[value] = index;
    });

    const matrix = Array(uniqueValues.length).fill().map(() => Array(uniqueValues.length).fill(0));
    
    for (let i = 0; i < columnData.length - 1; i++) {
        const currentValue = columnData[i];
        const nextValue = columnData[i + 1];
        matrix[valueToIndex[currentValue]][valueToIndex[nextValue]]++;
    }

    return {
        labels: uniqueValues,
        datasets: matrix.map((row, i) => ({
            label: uniqueValues[i],
            data: row,
            backgroundColor: row.map(value => `rgba(75, 192, 192, ${value / Math.max(...row)})`)
        }))
    };
}

function prepareBarLineScatterData(columnData, columnName, isNumeric, aggregationType) {
    if (isNumeric) {
        const processedData = processNumericData(columnData, aggregationType);
        return {
            labels: processedData.labels,
            datasets: [{
                label: columnName,
                data: processedData.values,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        };
    } else {
        const valueCounts = {};
        columnData.forEach(value => {
            valueCounts[value] = (valueCounts[value] || 0) + 1;
        });

        return {
            labels: Object.keys(valueCounts),
            datasets: [{
                label: `Count of ${columnName}`,
                data: Object.values(valueCounts),
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        };
    }
}

function processNumericData(data, aggregationType) {
    const numericData = data.map(value => parseFloat(value));
    
    switch (aggregationType) {
        case 'sum':
            return {
                labels: ['Total'],
                values: [numericData.reduce((a, b) => a + b, 0)]
            };
        case 'average':
            return {
                labels: ['Average'],
                values: [numericData.reduce((a, b) => a + b, 0) / numericData.length]
            };
        case 'count':
            return {
                labels: ['Count'],
                values: [numericData.length]
            };
        default:
            return {
                labels: data,
                values: numericData
            };
    }
}

function getChartTitle(chartType, isNumeric, aggregationType) {
    if (chartType === 'pie') return 'Distribution';
    if (chartType === 'heatmap') return 'Heatmap';
    if (!isNumeric) return 'Count';
    switch (aggregationType) {
        case 'sum': return 'Sum';
        case 'average': return 'Average';
        case 'count': return 'Count';
        default: return 'Values';
    }
}

function generateColors(count) {
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'
    ];
    return Array(count).fill().map((_, i) => colors[i % colors.length]);
}

// Real-time Sync
function toggleRealTimeSync() {
    const checkbox = document.getElementById('realTimeSync');
    if (checkbox.checked) {
        setupRealTimeSync();
    } else {
        stopRealTimeSync();
    }
}

function setupRealTimeSync() {
    if (realTimeSyncInterval) {
        clearInterval(realTimeSyncInterval);
    }
    
    realTimeSyncInterval = setInterval(() => {
        // Simulate real-time data updates
        if (currentData) {
            updateChart();
            generateSuggestions();
        }
    }, 5000); // Update every 5 seconds
}

function stopRealTimeSync() {
    if (realTimeSyncInterval) {
        clearInterval(realTimeSyncInterval);
        realTimeSyncInterval = null;
    }
}

// Export functionality
function exportReport() {
    if (!currentData) {
        alert('No data to export');
        return;
    }

    const report = {
        data: currentData,
        chart: {
            type: document.getElementById('chartType').value,
            column: document.getElementById('dataColumn').value,
            aggregation: document.getElementById('aggregationType').value
        },
        insights: document.getElementById('suggestion-content').innerHTML,
        timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data_report.json';
    a.click();
    window.URL.revokeObjectURL(url);
}

function generateSuggestions() {
    const suggestionContent = document.getElementById('suggestion-content');
    suggestionContent.innerHTML = '';

    // Analyze each column
    currentData.headers.forEach((header, index) => {
        const values = currentData.rows.map(row => row[index]);
        const isNumeric = values.every(v => !isNaN(parseFloat(v)));
        
        const suggestionCard = document.createElement('div');
        suggestionCard.className = 'suggestion-card';
        
        if (isNumeric) {
            const validValues = values.map(v => parseFloat(v));
            const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;
            const max = Math.max(...validValues);
            const min = Math.min(...validValues);
            const trend = validValues[validValues.length - 1] - validValues[0];
            const stdDev = calculateStandardDeviation(validValues);

            suggestionCard.innerHTML = `
                <h3>${header}</h3>
                <p>Average: ${avg.toFixed(2)}</p>
                <p>Range: ${min.toFixed(2)} - ${max.toFixed(2)}</p>
                <p>Standard Deviation: ${stdDev.toFixed(2)}</p>
                ${generateNumericInsights(avg, trend, stdDev)}
            `;
        } else {
            const valueCounts = {};
            values.forEach(value => {
                valueCounts[value] = (valueCounts[value] || 0) + 1;
            });
            
            const mostCommon = Object.entries(valueCounts)
                .sort((a, b) => b[1] - a[1])[0];
            
            suggestionCard.innerHTML = `
                <h3>${header}</h3>
                <p>Total Unique Values: ${Object.keys(valueCounts).length}</p>
                <p>Most Common: ${mostCommon[0]} (${mostCommon[1]} times)</p>
                ${generateCategoricalInsights(valueCounts)}
            `;
        }
        
        suggestionContent.appendChild(suggestionCard);
    });
}

function calculateStandardDeviation(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
}

function generateNumericInsights(avg, trend, stdDev) {
    let insights = [];
    
    // Trend insights
    if (trend > 0) {
        insights.push('📈 Increasing trend detected - Consider monitoring for potential growth opportunities');
    } else if (trend < 0) {
        insights.push('📉 Decreasing trend detected - May need attention to prevent further decline');
    } else {
        insights.push('→ Stable trend observed - Indicates consistent performance');
    }

    // Value range insights
    if (avg > 80) {
        insights.push('⚠️ High average value - Consider optimization opportunities');
    } else if (avg < 20) {
        insights.push('⚠️ Low average value - Potential for improvement');
    }

    // Variability insights
    if (stdDev > avg * 0.5) {
        insights.push('📊 High variability detected - May need to investigate causes of fluctuation');
    } else if (stdDev < avg * 0.1) {
        insights.push('📊 Low variability - Indicates stable and predictable patterns');
    }

    // Recommendations
    insights.push('<strong>Recommendations:</strong>');
    if (trend > 0 && avg > 80) {
        insights.push('• Consider implementing growth controls');
    } else if (trend < 0 && avg < 20) {
        insights.push('• Develop improvement strategies');
    }
    if (stdDev > avg * 0.5) {
        insights.push('• Investigate factors causing high variability');
    }

    return insights.map(insight => `<p class="insight">${insight}</p>`).join('');
}

function generateCategoricalInsights(valueCounts) {
    let insights = [];
    const totalValues = Object.values(valueCounts).reduce((a, b) => a + b, 0);
    const uniqueValues = Object.keys(valueCounts).length;

    // Distribution insights
    if (uniqueValues < 5) {
        insights.push('📊 Limited variety in values - Consider expanding options');
    } else if (uniqueValues > 20) {
        insights.push('📊 High variety in values - May need categorization');
    }

    // Dominance insights
    const mostCommon = Object.entries(valueCounts)
        .sort((a, b) => b[1] - a[1])[0];
    const percentage = (mostCommon[1] / totalValues) * 100;

    if (percentage > 50) {
        insights.push(`⚠️ High concentration on "${mostCommon[0]}" (${percentage.toFixed(1)}%)`);
    }

    // Recommendations
    insights.push('<strong>Recommendations:</strong>');
    if (uniqueValues < 5) {
        insights.push('• Consider diversifying options');
    } else if (uniqueValues > 20) {
        insights.push('• Implement categorization for better organization');
    }
    if (percentage > 50) {
        insights.push('• Investigate reasons for high concentration');
    }

    return insights.map(insight => `<p class="insight">${insight}</p>`).join('');
}

// Predictive Analytics
function performPredictiveAnalysis() {
    if (!currentData) {
        alert('No data available for analysis');
        return;
    }

    const columnIndex = document.getElementById('dataColumn').value;
    if (columnIndex === '') {
        alert('Please select a data column for analysis');
        return;
    }

    const columnData = currentData.rows.map(row => row[columnIndex]);
    const columnName = currentData.headers[columnIndex];
    const isNumeric = columnData.every(value => !isNaN(parseFloat(value)));

    if (!isNumeric) {
        alert('Predictive analysis requires numeric data');
        return;
    }

    const numericData = columnData.map(value => parseFloat(value));
    const predictions = generatePredictions(numericData);
    displayPredictions(predictions, columnName);
}

function generatePredictions(data) {
    // Simple linear regression for demonstration
    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = data;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate predictions for next 5 periods
    const predictions = [];
    for (let i = n; i < n + 5; i++) {
        predictions.push({
            period: i + 1,
            value: slope * i + intercept
        });
    }

    return {
        slope,
        intercept,
        predictions,
        rSquared: calculateRSquared(x, y, slope, intercept)
    };
}

function calculateRSquared(x, y, slope, intercept) {
    const yMean = y.reduce((a, b) => a + b, 0) / y.length;
    const totalSS = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const regressionSS = y.reduce((sum, yi, i) => {
        const predicted = slope * x[i] + intercept;
        return sum + Math.pow(predicted - yMean, 2);
    }, 0);
    return regressionSS / totalSS;
}

function displayPredictions(analysis, columnName) {
    const modal = document.getElementById('predictionsModal');
    const content = document.getElementById('predictionsContent');
    
    let html = `
        <h3>Predictive Analysis for ${columnName}</h3>
        <div class="analysis-summary">
            <p>Trend: ${analysis.slope > 0 ? 'Increasing' : 'Decreasing'}</p>
            <p>R-squared: ${(analysis.rSquared * 100).toFixed(2)}%</p>
        </div>
        <div class="predictions-table">
            <table>
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Predicted Value</th>
                    </tr>
                </thead>
                <tbody>
    `;

    analysis.predictions.forEach(pred => {
        html += `
            <tr>
                <td>${pred.period}</td>
                <td>${pred.value.toFixed(2)}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        <div class="modal-actions">
            <button onclick="closeModal('predictionsModal')">Close</button>
        </div>
    `;

    content.innerHTML = html;
    modal.classList.remove('hidden');
}

// Collaboration Features
let collaborators = new Set();
let comments = [];

function addCollaborator() {
    const email = document.getElementById('collaboratorEmail').value;
    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }

    if (collaborators.has(email)) {
        alert('This collaborator has already been added');
        return;
    }

    collaborators.add(email);
    updateCollaboratorsList();
    document.getElementById('collaboratorEmail').value = '';
}

function removeCollaborator(email) {
    collaborators.delete(email);
    updateCollaboratorsList();
}

function updateCollaboratorsList() {
    const list = document.getElementById('collaboratorsList');
    list.innerHTML = '';
    
    collaborators.forEach(email => {
        const li = document.createElement('li');
        li.innerHTML = `
            ${email}
            <button onclick="removeCollaborator('${email}')" class="remove-btn">×</button>
        `;
        list.appendChild(li);
    });
}

function addComment() {
    const commentText = document.getElementById('commentInput').value.trim();
    if (!commentText) {
        alert('Please enter a comment');
        return;
    }

    const comment = {
        id: Date.now(),
        text: commentText,
        timestamp: new Date().toISOString(),
        author: 'Current User' // In a real app, this would be the logged-in user
    };

    comments.push(comment);
    updateCommentsList();
    document.getElementById('commentInput').value = '';
}

function updateCommentsList() {
    const list = document.getElementById('commentsList');
    list.innerHTML = '';
    
    comments.forEach(comment => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">${comment.author}</span>
                <span class="comment-time">${new Date(comment.timestamp).toLocaleString()}</span>
            </div>
            <div class="comment-text">${comment.text}</div>
            <button onclick="deleteComment(${comment.id})" class="delete-btn">Delete</button>
        `;
        list.appendChild(li);
    });
}

function deleteComment(commentId) {
    comments = comments.filter(comment => comment.id !== commentId);
    updateCommentsList();
}

// Modal Management
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// Close modals when clicking outside
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.classList.add('hidden');
    }
});

// Data Filtering
let activeFilters = new Map();

function applyFilter() {
    const columnIndex = document.getElementById('filterColumn').value;
    const filterType = document.getElementById('filterType').value;
    const filterValue = document.getElementById('filterValue').value;

    if (!columnIndex || !filterType || !filterValue) {
        alert('Please fill in all filter fields');
        return;
    }

    const filter = {
        columnIndex,
        type: filterType,
        value: filterValue
    };

    activeFilters.set(columnIndex, filter);
    updateFilteredData();
    updateActiveFiltersList();
}

function removeFilter(columnIndex) {
    activeFilters.delete(columnIndex);
    updateFilteredData();
    updateActiveFiltersList();
}

function updateFilteredData() {
    if (!currentData) return;

    let filteredRows = [...currentData.rows];

    activeFilters.forEach(filter => {
        filteredRows = filteredRows.filter(row => {
            const value = row[filter.columnIndex];
            const filterValue = filter.value;

            switch (filter.type) {
                case 'equals':
                    return value === filterValue;
                case 'contains':
                    return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
                case 'greaterThan':
                    return parseFloat(value) > parseFloat(filterValue);
                case 'lessThan':
                    return parseFloat(value) < parseFloat(filterValue);
                case 'between':
                    const [min, max] = filterValue.split(',').map(v => parseFloat(v.trim()));
                    return parseFloat(value) >= min && parseFloat(value) <= max;
                default:
                    return true;
            }
        });
    });

    currentData.filteredRows = filteredRows;
    updateChart();
}

function updateActiveFiltersList() {
    const list = document.getElementById('activeFiltersList');
    list.innerHTML = '';

    activeFilters.forEach((filter, columnIndex) => {
        const li = document.createElement('li');
        const columnName = currentData.headers[columnIndex];
        li.innerHTML = `
            ${columnName}: ${filter.type} ${filter.value}
            <button onclick="removeFilter(${columnIndex})" class="remove-btn">×</button>
        `;
        list.appendChild(li);
    });
}

// Advanced Visualization Options
function updateChartOptions() {
    if (!currentChart) return;

    const options = {
        responsive: true,
        plugins: {
            title: {
                display: true,
                text: document.getElementById('chartTitle').value || 'Data Visualization'
            },
            legend: {
                display: document.getElementById('showLegend').checked,
                position: document.getElementById('legendPosition').value
            }
        },
        scales: {
            y: {
                beginAtZero: document.getElementById('beginAtZero').checked,
                grid: {
                    display: document.getElementById('showGrid').checked
                }
            },
            x: {
                grid: {
                    display: document.getElementById('showGrid').checked
                }
            }
        }
    };

    currentChart.options = options;
    currentChart.update();
}

function updateChartColors() {
    if (!currentChart) return;

    const colorScheme = document.getElementById('colorScheme').value;
    const colors = getColorScheme(colorScheme);
    
    currentChart.data.datasets.forEach((dataset, index) => {
        dataset.backgroundColor = colors[index % colors.length];
        dataset.borderColor = colors[index % colors.length];
    });

    currentChart.update();
}

function getColorScheme(scheme) {
    const schemes = {
        default: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)', 'rgba(255, 206, 86, 0.6)'],
        pastel: ['rgba(255, 182, 193, 0.6)', 'rgba(176, 224, 230, 0.6)', 'rgba(221, 160, 221, 0.6)'],
        dark: ['rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)', 'rgba(255, 206, 86, 0.6)'],
        monochrome: ['rgba(128, 128, 128, 0.6)', 'rgba(160, 160, 160, 0.6)', 'rgba(192, 192, 192, 0.6)']
    };

    return schemes[scheme] || schemes.default;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    currentTheme = savedTheme;
    document.documentElement.setAttribute('data-theme', currentTheme);

    // Add event listeners for chart options
    document.getElementById('chartTitle').addEventListener('input', updateChartOptions);
    document.getElementById('showLegend').addEventListener('change', updateChartOptions);
    document.getElementById('legendPosition').addEventListener('change', updateChartOptions);
    document.getElementById('beginAtZero').addEventListener('change', updateChartOptions);
    document.getElementById('showGrid').addEventListener('change', updateChartOptions);
    document.getElementById('colorScheme').addEventListener('change', updateChartColors);

    // Add event listeners for filters
    document.getElementById('filterColumn').addEventListener('change', () => {
        const columnIndex = document.getElementById('filterColumn').value;
        const columnName = currentData?.headers[columnIndex];
        if (columnName) {
            document.getElementById('filterValue').placeholder = `Enter value for ${columnName}`;
        }
    });
});