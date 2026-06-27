const supabaseUrl = 'https://ipwtfpyrogoxwlgbwhwi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwd3RmcHlyb2dveHdsZ2J3aHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzIwNjIsImV4cCI6MjA5ODE0ODA2Mn0.N5VMCPlRHA2ciulhDJoL5HPI-HoG0n13STDG6sh6TXs';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let employees = [];
let recordsData = [];
let currentUser = null;

// Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = type === 'success' ? '✅' : '❌';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Auth Management ---

async function handleAuth(event) {
    event.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    
    // Supabase Auth requires an email format, so we map the username to a dummy domain under the hood
    const email = `${username}@otmanager.local`;
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });
    
    if (error) {
        showToast('Login error: ' + error.message, 'error');
    } else {
        showToast('Welcome back!');
    }
}

async function handleLogout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        showToast('Logout error: ' + error.message, 'error');
    }
}

// Watch for auth state changes
supabaseClient.auth.onAuthStateChange((event, session) => {
    const authSection = document.getElementById('auth-section');
    const appDashboard = document.getElementById('app-dashboard');
    
    if (session && session.user) {
        currentUser = session.user;
        
        // Update sidebar with the username (stripping the dummy domain)
        const usernameDisplay = document.getElementById('sidebar-username');
        if (usernameDisplay && currentUser.email) {
            usernameDisplay.textContent = currentUser.email.split('@')[0];
        }

        authSection.classList.remove('active');
        appDashboard.classList.remove('hidden');
        initApp(); // Load data for the logged-in user
    } else {
        currentUser = null;
        authSection.classList.add('active');
        appDashboard.classList.add('hidden');
        
        // Clear data from memory
        employees = [];
        recordsData = [];
        renderEmployees();
        renderRecords();
        renderSummary();
    }
});

// Initialization after login
async function initApp() {
    await fetchEmployees();
    await fetchRecords();
}

// --- Employee Management ---

async function fetchEmployees() {
    const { data, error } = await supabaseClient
        .from('employees')
        .select('*')
        .order('name', { ascending: true });
        
    if (error) {
        showToast('Failed to load employees: ' + error.message, 'error');
        console.error(error);
        return;
    }
    employees = data;
    renderEmployees();
}

async function addEmployee() {
    const nameInput = document.getElementById("empName");
    const name = nameInput.value.trim();

    if (name === "") {
        showToast("Enter Employee Name", "error");
        return;
    }

    if (employees.some(emp => emp.name.toLowerCase() === name.toLowerCase())) {
        showToast("Employee already exists", "error");
        return;
    }

    const { data, error } = await supabaseClient
        .from('employees')
        .insert([{ name: name, user_id: currentUser.id }])
        .select();

    if (error) {
        showToast('Error adding employee: ' + error.message, 'error');
        console.error(error);
        return;
    }

    nameInput.value = "";
    showToast('Employee added successfully');
    await fetchEmployees();
}

async function editEmployee(id, oldName) {
    const newName = prompt("Edit Employee Name", oldName);
    if (!newName || newName.trim() === "" || newName === oldName) return;

    if (employees.some(emp => emp.name.toLowerCase() === newName.trim().toLowerCase() && emp.id !== id)) {
        showToast("Employee name already exists", "error");
        return;
    }

    const { error: empError } = await supabaseClient
        .from('employees')
        .update({ name: newName.trim() })
        .eq('id', id);

    if (empError) {
        showToast('Error updating employee: ' + empError.message, 'error');
        console.error(empError);
        return;
    }

    const { error: recError } = await supabaseClient
        .from('records')
        .update({ employee_name: newName.trim() })
        .eq('employee_id', id);

    if (recError) {
        showToast('Error updating records: ' + recError.message, 'error');
        console.error(recError);
        return;
    }

    showToast('Employee updated successfully');
    await fetchEmployees();
    await fetchRecords();
}

async function deleteEmployee(id) {
    if (!confirm("Delete Employee? This will also delete all their records.")) return;

    const { error } = await supabaseClient
        .from('employees')
        .delete()
        .eq('id', id);

    if (error) {
        showToast('Error deleting employee: ' + error.message, 'error');
        console.error(error);
        return;
    }

    showToast('Employee deleted');
    await fetchEmployees();
    await fetchRecords(); // Refresh records as well since it cascades
}

function renderEmployees() {
    const employeeTable = document.getElementById("employeeTable");
    const employeeSelect = document.getElementById("employee");
    
    let tableHtml = "";
    employeeSelect.innerHTML = '<option value="">-- Select Employee --</option>';

    employees.forEach(emp => {
        // Populate Dropdown
        let op = document.createElement("option");
        op.value = emp.id;
        op.text = emp.name;
        employeeSelect.add(op);

        // Populate Table
        tableHtml += `
            <tr>
                <td>${emp.name}</td>
                <td>
                    <button class="btn btn-outline" onclick="editEmployee('${emp.id}', '${emp.name.replace(/'/g, "\\'")}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteEmployee('${emp.id}')">Delete</button>
                </td>
            </tr>
        `;
    });

    employeeTable.innerHTML = tableHtml;
}

// --- OT Records Management ---

async function fetchRecords() {
    const { data, error } = await supabaseClient
        .from('records')
        .select('*')
        .order('date', { ascending: false });
        
    if (error) {
        showToast('Failed to load records: ' + error.message, 'error');
        console.error(error);
        return;
    }
    recordsData = data;
    renderRecords();
    renderSummary();
}

function parseTime(time) {
    let p = time.split(":");
    return parseInt(p[0]) + (parseInt(p[1]) / 60);
}

async function addRecord() {
    const empId = document.getElementById("employee").value;
    const date = document.getElementById("date").value;
    const startText = document.getElementById("start").value;
    const endText = document.getElementById("end").value;

    if (!empId || !date || !startText || !endText) {
        showToast("Please fill all fields", "error");
        return;
    }

    let start = parseTime(startText);
    let end = parseTime(endText);
    
    // Validation: Out time must be after In time
    if (end <= start) {
        showToast("Out Time must be after In Time", "error");
        return;
    }

    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    // Validation: Check for duplicate entry on the same date
    if (recordsData.some(r => r.employee_id === empId && r.date === date)) {
        showToast("An OT entry already exists for this employee on this date.", "error");
        return;
    }

    let adjustedStart = Math.max(start, 8);
    let normalOT = 0;
    let specialOT = 0;
    let dayType = "Weekday";

    if (document.getElementById("holiday").checked) {
        dayType = "Public Holiday";
        specialOT = Math.max(0, end - adjustedStart);
    } else {
        let day = new Date(date).getDay();
        
        if (day === 0) { // Sunday
            dayType = "Sunday";
            specialOT = Math.max(0, end - adjustedStart);
        } else if (day === 6) { // Saturday
            dayType = "Saturday";
            let otStart = adjustedStart + 9;
            normalOT = Math.max(0, Math.min(end, otStart) - adjustedStart);
            if (end > otStart) {
                specialOT = end - otStart;
            }
        } else { // Weekday
            dayType = "Weekday";
            let otStart = adjustedStart + 9; // Assuming 9 hours standard shift (e.g. 8 to 17)
            if (end > otStart) {
                specialOT = end - otStart;
            }
        }
    }

    const newRecord = {
        employee_id: emp.id,
        employee_name: emp.name,
        date: date,
        day_type: dayType,
        in_time: startText,
        out_time: endText,
        normal_ot: Number(normalOT.toFixed(2)),
        special_ot: Number(specialOT.toFixed(2)),
        user_id: currentUser.id
    };

    const { error } = await supabaseClient
        .from('records')
        .insert([newRecord]);

    if (error) {
        showToast('Error saving record: ' + error.message, 'error');
        console.error(error);
        return;
    }

    showToast('Record saved successfully');
    await fetchRecords();
}

async function deleteRecord(id) {
    if (!confirm("Delete Record?")) return;

    const { error } = await supabaseClient
        .from('records')
        .delete()
        .eq('id', id);

    if (error) {
        showToast('Error deleting record: ' + error.message, 'error');
        console.error(error);
        return;
    }

    showToast('Record deleted');
    await fetchRecords();
}

function renderRecords() {
    const keyword = document.getElementById("search").value.toLowerCase();
    const recordsTbody = document.getElementById("records");
    
    let html = "";

    recordsData.forEach(r => {
        if (r.employee_name.toLowerCase().includes(keyword)) {
            html += `
                <tr>
                    <td>${r.employee_name}</td>
                    <td>${r.date}</td>
                    <td>${r.day_type}</td>
                    <td>${r.in_time}</td>
                    <td>${r.out_time}</td>
                    <td>${r.normal_ot}</td>
                    <td>${r.special_ot}</td>
                    <td class="hide-print">
                        <button class="btn btn-outline" onclick="deleteRecord('${r.id}')">Delete</button>
                    </td>
                </tr>
            `;
        }
    });

    recordsTbody.innerHTML = html;
}

function renderSummary() {
    let sum = {};

    recordsData.forEach(r => {
        if (!sum[r.employee_name]) {
            sum[r.employee_name] = { normal: 0, special: 0 };
        }
        sum[r.employee_name].normal += r.normal_ot;
        sum[r.employee_name].special += r.special_ot;
    });

    const summaryTbody = document.getElementById("summary");
    let html = "";

    for (let emp in sum) {
        html += `
            <tr>
                <td>${emp}</td>
                <td>${sum[emp].normal.toFixed(2)}</td>
                <td>${sum[emp].special.toFixed(2)}</td>
            </tr>
        `;
    }

    summaryTbody.innerHTML = html;
}

// --- Print and Export Utilities ---

function exportCSV() {
    let csv = "Employee,Date,Day Type,In Time,Out Time,Normal OT,Special OT\n";

    recordsData.forEach(r => {
        csv += `${r.employee_name},${r.date},${r.day_type},${r.in_time},${r.out_time},${r.normal_ot},${r.special_ot}\n`;
    });

    let blob = new Blob([csv], { type: "text/csv" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `OT_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

async function clearAllRecords() {
    if (!confirm("Are you sure you want to clear all OT records for the month? This cannot be undone.")) return;

    const { error } = await supabaseClient
        .from('records')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete where id is not an empty uuid

    if (error) {
        showToast('Error clearing records: ' + error.message, 'error');
        console.error(error);
        return;
    }

    showToast("All OT records cleared successfully.");
    await fetchRecords();
}

function printContent(title, tableSelector) {
    let printWindow = window.open("", "_blank");
    printWindow.document.write(`
        <html>
        <head>
            <title>${title}</title>
            <style>
                body{ font-family: 'Arial', sans-serif; padding: 20px; }
                h2{ text-align: center; color: #333; }
                table{ width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td{ border: 1px solid #ccc; padding: 10px; text-align: left; }
                th{ background-color: #f8f9fa; }
                .hide-print { display: none !important; }
            </style>
        </head>
        <body>
            <h2>${title}</h2>
            ${document.querySelector(tableSelector).outerHTML}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function() {
        printWindow.print();
        printWindow.close();
    }, 500);
}

function printOTTable() {
    printContent("OT Entry Report", "#otTableToPrint");
}

function printSummary() {
    printContent("Monthly Summary Report", "#summaryTableToPrint");
}

// --- Navigation ---

function navigateTo(sectionId, element) {
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.getElementById(sectionId).classList.add('active');
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    if (element) {
        element.classList.add('active');
    }
}
