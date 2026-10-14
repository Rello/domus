<?php
namespace OCP;

interface IRequest {
    public function getHeader(string $name): string;
}
