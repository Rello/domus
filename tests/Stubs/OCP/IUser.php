<?php
namespace OCP;

interface IUser {
	public function getUID();
	public function isEnabled(): bool;
	public function getEMailAddress(): ?string;
}
