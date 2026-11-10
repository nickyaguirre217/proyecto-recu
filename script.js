document.addEventListener('DOMContentLoaded', () => {
    // --- LÓGICA DEL CHECKLIST ---
    const checkboxes = document.querySelectorAll('.task-check');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const completedTasksSpan = document.getElementById('completed-tasks');
    const totalTasksSpan = document.getElementById('total-tasks');

    const totalTasks = checkboxes.length;
    totalTasksSpan.textContent = totalTasks;

    function updateProgress() {
        const completedTasks = document.querySelectorAll('.task-check:checked').length;
        const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}% Completado`;
        completedTasksSpan.textContent = completedTasks;

        if (percentage === 100) {
            progressBar.classList.remove('bg-blue-600');
            progressBar.classList.add('bg-green-500');
        } else {
            progressBar.classList.remove('bg-green-500');
            progressBar.classList.add('bg-blue-600');
        }
    }

    checkboxes.forEach(checkbox => checkbox.addEventListener('change', updateProgress));
    updateProgress();

    // --- ENVÍO DE HALLAZGOS A GOOGLE SHEETS ---
    const findingForm = document.getElementById('finding-form');
    const descriptionInput = document.getElementById('finding-desc');
    const riskInput = document.getElementById('finding-risk');
    const submitButton = findingForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwq7aHfAA60xLz242q8hKWw7xHE4zkTRwrt1ulDKuYt5k0PcG14hghfL_pDm-lplZJN8w/exec';
    const riskValues = { Alto: 'Alta', Medio: 'Media', Bajo: 'Baja' };

    const findingStatus = document.createElement('p');
    findingStatus.className = 'text-sm';
    findingStatus.setAttribute('role', 'status');
    findingStatus.setAttribute('aria-live', 'polite');
    findingForm.appendChild(findingStatus);

    let isSubmitting = false;

    function createRequestId() {
        const values = new Uint32Array(4);
        window.crypto.getRandomValues(values);
        return Array.from(values, value => value.toString(16).padStart(8, '0')).join('');
    }

    function setFindingStatus(message, className) {
        findingStatus.textContent = message;
        findingStatus.className = `text-sm ${className}`;
    }

    function sendFindingToGoogle(desc, risk, requestId) {
        const iframe = document.createElement('iframe');
        iframe.name = `finding-response-${requestId}`;
        iframe.title = 'Envío del hallazgo';
        iframe.hidden = true;

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = GOOGLE_APPS_SCRIPT_URL;
        form.target = iframe.name;
        form.hidden = true;

        const fields = {
            descripcion: desc,
            riesgo: riskValues[risk],
            requestId
        };

        Object.entries(fields).forEach(([name, value]) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = value;
            form.appendChild(input);
        });

        document.body.append(iframe, form);
        try {
            form.submit();
        } catch (error) {
            form.remove();
            iframe.remove();
            throw error;
        }

        window.setTimeout(() => {
            form.remove();
            iframe.remove();
        }, 60000);
    }

    findingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSubmitting) {
            return;
        }

        const desc = descriptionInput.value.trim();
        const risk = riskInput.value;

        if (!desc) {
            setFindingStatus('Escribe la descripción del hallazgo.', 'text-red-600');
            descriptionInput.focus();
            return;
        }

        if (!Object.prototype.hasOwnProperty.call(riskValues, risk)) {
            setFindingStatus('Selecciona un nivel de riesgo válido.', 'text-red-600');
            riskInput.focus();
            return;
        }

        const requestId = createRequestId();

        isSubmitting = true;
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';

        try {
            sendFindingToGoogle(desc, risk, requestId);
            descriptionInput.value = '';
            riskInput.selectedIndex = -1;
            checkboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            updateProgress();
            setFindingStatus(
                'Solicitud enviada.',
                'text-blue-700'
            );
        } catch (error) {
            console.error('No se pudo enviar el hallazgo:', error);
            setFindingStatus(
                'No se pudo iniciar el envío. Los datos se conservaron; puedes reintentar.',
                'text-red-600'
            );
        } finally {
            window.setTimeout(() => {
                isSubmitting = false;
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }, 750);
        }
    });

});
