import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

export function askConfirm({ title, text, confirmText, danger = false }) {
  return Swal.fire({
    title,
    text,
    icon: danger ? "warning" : "question",
    showCancelButton: true,
    focusCancel: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    confirmButtonColor: danger ? "#b42318" : "#122236",
    cancelButtonColor: "#ffffff",
    customClass: { cancelButton: "swal-cancel", popup: "swal-balancio" },
    buttonsStyling: true,
  }).then((result) => result.isConfirmed);
}

export function askPrompt({ title, text, placeholder = "", confirmText = "Save", initialValue = "" }) {
  return Swal.fire({
    title,
    text,
    input: "text",
    inputValue: initialValue,
    inputPlaceholder: placeholder,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    confirmButtonColor: "#122236",
    cancelButtonColor: "#ffffff",
    customClass: { cancelButton: "swal-cancel", popup: "swal-balancio" },
    inputValidator: (value) => (value && value.trim() ? undefined : "Enter a name."),
  }).then((result) => (result.isConfirmed ? result.value.trim() : null));
}

export function flash(title, icon = "success") {
  return Swal.fire({
    toast: true,
    position: "bottom-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 2400,
    timerProgressBar: true,
    customClass: { popup: "swal-balancio" },
  });
}
