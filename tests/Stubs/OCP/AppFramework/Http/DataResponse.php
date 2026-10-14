<?php
namespace OCP\AppFramework\Http;

class DataResponse {
	public function addHeader(string $name, string $value): void {}
	/** @var mixed */
	private $data;

	/** @var int */
	private $status;

	public function __construct($data = null, int $status = 200) {
		$this->data = $data;
		$this->status = $status;
	}

	public function getData() {
		return $this->data;
	}

	public function getStatus(): int {
		return $this->status;
	}
}
